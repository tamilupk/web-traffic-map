/**
 * Authentication API request handlers
 * Handles WebAuthn registration/login and JWT issuance
 * @module api/auth-handlers
 */

const { v4: uuidv4 } = require('uuid');
const {
  getUserByEmail,
  getUserById,
  createUser,
  getInviteToken,
  markInviteTokenUsed,
  createInviteToken,
  savePasskeyCredential,
  getPasskeyCredentialById,
  updateCredentialCounter,
  consumeChallenge,
} = require('../db/queries');

const { createToken } = require('../auth/jwt');
const {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
} = require('../auth/webauthn');

/**
 * POST /api/auth/register/options
 * Validates invite token, creates user if not exists, returns WebAuthn registration options
 */
async function handleRegisterOptions(c) {
  try {
    const { token, displayName } = await c.req.json();

    if (!token) {
      return c.json({ success: false, error: 'Invite token is required' }, 400);
    }
    if (!displayName || displayName.trim().length === 0) {
      return c.json({ success: false, error: 'Display name is required' }, 400);
    }

    const invite = getInviteToken(token);
    if (!invite) {
      return c.json({ success: false, error: 'Invalid invite token' }, 400);
    }
    if (invite.used) {
      return c.json({ success: false, error: 'Invite token already used' }, 400);
    }
    if (new Date(invite.expires_at) < new Date()) {
      return c.json({ success: false, error: 'Invite token has expired' }, 400);
    }

    // Create user if not exists
    let user = getUserByEmail(invite.email);
    if (!user) {
      user = createUser(invite.email, displayName.trim());
    }

    const options = await generateRegistrationOptions(user);
    return c.json({ success: true, options });
  } catch (error) {
    console.error('Error generating registration options:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * POST /api/auth/register/verify
 * Verifies WebAuthn registration, stores credential, marks invite used, issues JWT
 */
async function handleRegisterVerify(c) {
  try {
    const body = await c.req.json();
    const { token, credential, challenge } = body;

    // Re-validate the invite token
    const invite = getInviteToken(token);
    if (!invite || invite.used || new Date(invite.expires_at) < new Date()) {
      return c.json({ success: false, error: 'Invalid or expired invite token' }, 400);
    }

    const user = getUserByEmail(invite.email);
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 400);
    }

    // Consume the stored challenge (one-time use)
    const storedChallenge = consumeChallenge(challenge);
    if (!storedChallenge) {
      return c.json({ success: false, error: 'Invalid or expired challenge' }, 400);
    }
    if (new Date(storedChallenge.expires_at) < new Date()) {
      return c.json({ success: false, error: 'Challenge expired' }, 400);
    }

    if (storedChallenge.type !== 'registration' || storedChallenge.user_id !== user.id) {
      return c.json({ success: false, error: 'Invalid registration challenge' }, 400);
    }

    const verification = await verifyRegistration(credential, storedChallenge.challenge);
    if (!verification.verified || !verification.registrationInfo) {
      return c.json({ success: false, error: 'Registration verification failed' }, 400);
    }

    const { credential: regCredential } = verification.registrationInfo;

    // Store the credential
    savePasskeyCredential({
      user_id: user.id,
      credential_id: regCredential.id,
      public_key: Buffer.from(regCredential.publicKey).toString('base64url'),
      counter: regCredential.counter,
      transports: credential.response?.transports || [],
    });

    // Mark invite as used
    markInviteTokenUsed(token);

    // Issue JWT
    const jwt = await createToken(user);

    return c.json({
      success: true,
      token: jwt,
      user: { id: user.id, email: user.email, display_name: user.display_name, is_admin: !!user.is_admin }
    });
  } catch (error) {
    console.error('Error verifying registration:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * POST /api/auth/login/options
 * Returns WebAuthn authentication options for discoverable credentials
 */
async function handleLoginOptions(c) {
  try {
    const options = await generateAuthenticationOptions();
    return c.json({ success: true, options });
  } catch (error) {
    console.error('Error generating authentication options:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * POST /api/auth/login/verify
 * Verifies WebAuthn authentication and returns JWT
 */
async function handleLoginVerify(c) {
  try {
    const body = await c.req.json();
    const { credential, challenge } = body;

    // Consume the stored challenge
    const storedChallenge = consumeChallenge(challenge);
    if (!storedChallenge) {
      return c.json({ success: false, error: 'Invalid or expired challenge' }, 400);
    }
    if (new Date(storedChallenge.expires_at) < new Date()) {
      return c.json({ success: false, error: 'Challenge expired' }, 400);
    }

    if (storedChallenge.type !== 'authentication') {
      return c.json({ success: false, error: 'Invalid authentication challenge' }, 400);
    }

    // Look up the credential by ID
    const storedCredential = getPasskeyCredentialById(credential.id);
    if (!storedCredential) {
      return c.json({ success: false, error: 'Unknown credential' }, 400);
    }

    const verification = await verifyAuthentication(
      credential,
      storedChallenge.challenge,
      storedCredential
    );

    if (!verification.verified) {
      return c.json({ success: false, error: 'Authentication failed' }, 401);
    }

    // Update counter to prevent replay attacks
    updateCredentialCounter(
      storedCredential.credential_id,
      verification.authenticationInfo.newCounter
    );

    const user = getUserById(storedCredential.user_id);
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 400);
    }

    const jwt = await createToken(user);

    return c.json({
      success: true,
      token: jwt,
      user: { id: user.id, email: user.email, display_name: user.display_name, is_admin: !!user.is_admin }
    });
  } catch (error) {
    console.error('Error verifying authentication:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * GET /api/auth/me
 * Returns the authenticated user's info (requires JWT)
 */
function handleGetMe(c) {
  const user = c.get('user');
  return c.json({ success: true, user });
}

/**
 * POST /api/admin/invite
 * Admin-only: creates an invite token for a new user
 */
async function handleAdminInvite(c) {
  try {
    const { email } = await c.req.json();

    if (!email || !email.includes('@')) {
      return c.json({ success: false, error: 'Valid email is required' }, 400);
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const existingUser = getUserByEmail(email);

    createInviteToken(email, token, expiresAt);

    const origin = process.env.WEBAUTHN_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
    const registrationUrl = `${origin}/register?token=${token}`;

    return c.json({
      success: true,
      invite: {
        email,
        token,
        expires_at: expiresAt,
        registration_url: registrationUrl,
        existing_user: !!existingUser,
      }
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

module.exports = {
  handleRegisterOptions,
  handleRegisterVerify,
  handleLoginOptions,
  handleLoginVerify,
  handleGetMe,
  handleAdminInvite,
};
