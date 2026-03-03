/**
 * WebAuthn ceremony helpers using @simplewebauthn/server
 * Handles registration and authentication option generation and verification
 * @module auth/webauthn
 */

const { config } = require('../config');
const {
  storeChallenge,
  getPasskeyCredentialsByUserId
} = require('../db/queries');

/** @type {Object|null} Cached module reference for ESM interop */
let _simpleWebAuthn = null;

/**
 * Dynamically import @simplewebauthn/server (ESM-only module)
 * Caches the result for subsequent calls
 * @returns {Promise<Object>} The simplewebauthn/server module
 */
async function getSimpleWebAuthn() {
  if (!_simpleWebAuthn) {
    _simpleWebAuthn = await import('@simplewebauthn/server');
  }
  return _simpleWebAuthn;
}

/**
 * Generate registration options for a new user
 * @param {Object} user - User object with id, email, display_name
 * @returns {Promise<Object>} Registration options to send to the browser
 */
async function generateRegistrationOptions(user) {
  const { generateRegistrationOptions: genRegOpts } = await getSimpleWebAuthn();

  const existingCredentials = getPasskeyCredentialsByUserId(user.id);

  const options = await genRegOpts({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.email,
    userDisplayName: user.display_name || user.email,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map(cred => ({
      id: cred.credential_id,
      transports: JSON.parse(cred.transports || '[]'),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store the challenge with 5-minute TTL
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  storeChallenge(options.challenge, user.id, 'registration', expiresAt);

  return options;
}

/**
 * Verify a registration response from the browser
 * @param {Object} body - The credential response from navigator.credentials.create()
 * @param {string} expectedChallenge - The challenge we sent
 * @returns {Promise<Object>} Verification result with registrationInfo
 */
async function verifyRegistration(body, expectedChallenge) {
  const { verifyRegistrationResponse } = await getSimpleWebAuthn();

  return verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: config.webauthnOrigin,
    expectedRPID: config.rpId,
  });
}

/**
 * Generate authentication options (login with discoverable credentials)
 * @returns {Promise<Object>} Authentication options to send to the browser
 */
async function generateAuthenticationOptions() {
  const { generateAuthenticationOptions: genAuthOpts } = await getSimpleWebAuthn();

  const options = await genAuthOpts({
    rpID: config.rpId,
    userVerification: 'preferred',
    allowCredentials: [],
  });

  // Store challenge with 5-minute TTL
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  storeChallenge(options.challenge, null, 'authentication', expiresAt);

  return options;
}

/**
 * Verify an authentication response from the browser
 * @param {Object} body - The credential response from navigator.credentials.get()
 * @param {string} expectedChallenge - The challenge we sent
 * @param {Object} credential - The stored credential from DB
 * @returns {Promise<Object>} Verification result with authenticationInfo
 */
async function verifyAuthentication(body, expectedChallenge, credential) {
  const { verifyAuthenticationResponse } = await getSimpleWebAuthn();

  return verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: config.webauthnOrigin,
    expectedRPID: config.rpId,
    credential: {
      id: credential.credential_id,
      publicKey: Uint8Array.from(Buffer.from(credential.public_key, 'base64url')),
      counter: credential.counter,
      transports: JSON.parse(credential.transports || '[]'),
    },
  });
}

module.exports = {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
};
