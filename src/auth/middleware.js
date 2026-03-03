/**
 * JWT authentication middleware for Hono
 * Extracts and verifies JWT from Authorization: Bearer header
 * Sets c.set('user', payload) on success
 * @module auth/middleware
 */

const { verifyToken } = require('./jwt');

/**
 * Hono middleware that requires a valid JWT
 * @param {import('hono').Context} c - Hono context
 * @param {Function} next - Next middleware
 */
async function authMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token);
    c.set('user', { user_id: payload.user_id, email: payload.email, is_admin: !!payload.is_admin });
    await next();
  } catch (err) {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  }
}

/**
 * Hono middleware that requires admin privileges (must be used after authMiddleware)
 * @param {import('hono').Context} c - Hono context
 * @param {Function} next - Next middleware
 */
async function adminMiddleware(c, next) {
  const user = c.get('user');
  if (!user || !user.is_admin) {
    return c.json({ success: false, error: 'Admin access required' }, 403);
  }
  await next();
}

module.exports = { authMiddleware, adminMiddleware };
