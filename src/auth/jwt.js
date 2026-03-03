/**
 * JWT creation and verification utilities
 * Uses the jose library with HS256 algorithm
 * @module auth/jwt
 */

const { SignJWT, jwtVerify } = require('jose');
const { config } = require('../config');
const { getOrCreateJwtSecret } = require('../db/queries');

/** @type {Uint8Array|null} Cached secret key */
let secretKey = null;

/**
 * Get the JWT secret as a Uint8Array (required by jose)
 * @returns {Uint8Array}
 */
function getSecretKey() {
  if (secretKey) return secretKey;
  const raw = config.jwtSecret || getOrCreateJwtSecret();
  secretKey = new TextEncoder().encode(raw);
  return secretKey;
}

/**
 * Create a signed JWT for a user
 * @param {Object} user - User object with id and email
 * @returns {Promise<string>} Signed JWT string
 */
async function createToken(user) {
  const key = getSecretKey();
  return new SignJWT({ user_id: user.id, email: user.email, is_admin: !!user.is_admin })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiry)
    .setIssuer('web-traffic-map')
    .sign(key);
}

/**
 * Verify a JWT and return the payload
 * @param {string} token - JWT string
 * @returns {Promise<Object>} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
async function verifyToken(token) {
  const key = getSecretKey();
  const { payload } = await jwtVerify(token, key, { issuer: 'web-traffic-map' });
  return payload;
}

module.exports = { createToken, verifyToken };
