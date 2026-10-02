/**
 * API routes configuration
 * Defines all REST API endpoints with auth middleware on protected routes
 * @module api/routes
 */

const { Hono } = require('hono');
const { config } = require('../config');
const { bodyLimit } = require('hono/body-limit');
const { createAuthRateLimiter } = require('../auth/rate-limit');
const { authMiddleware, adminMiddleware } = require('../auth/middleware');
const {
  handleRegisterOptions,
  handleRegisterVerify,
  handleLoginOptions,
  handleLoginVerify,
  handleGetMe,
  handleAdminInvite,
} = require('./auth-handlers');
const {
  handleGetLogs,
  handleGetStats,
  handleGetLocations,
  handleGetDomains,
  handleGetCountries,
  handleGetStatus,
  handleProcessGeo,
  handleGetThreats,
  handleRescanThreats
} = require('./handlers');

/**
 * Create and configure API routes
 * Public auth routes are separated from JWT-protected data routes
 * @returns {Hono} Configured Hono router
 */
function createApiRoutes() {
  const api = new Hono();

  // ===== Public auth routes (no JWT required) =====
  const authPublic = new Hono();
  const authRateLimiter = createAuthRateLimiter();
  const authBodyLimit = bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) => c.json({ success: false, error: 'Authentication request is too large' }, 413)
  });
  authPublic.use('/register/*', authRateLimiter, authBodyLimit);
  authPublic.use('/login/*', authRateLimiter, authBodyLimit);
  authPublic.post('/register/options', handleRegisterOptions);
  authPublic.post('/register/verify', handleRegisterVerify);
  authPublic.post('/login/options', handleLoginOptions);
  authPublic.post('/login/verify', handleLoginVerify);
  api.route('/auth', authPublic);

  // ===== Protected routes (JWT required) =====
  const protectedApi = new Hono();
  protectedApi.use('*', authMiddleware);

  // Auth info
  protectedApi.get('/auth/me', handleGetMe);

  // Only browser-safe map configuration; never expose the full server config.
  protectedApi.get('/map-config', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ cartoBasemapApiKey: config.cartoBasemapApiKey });
  });

  // Log queries
  protectedApi.get('/logs', handleGetLogs);

  // Statistics
  protectedApi.get('/stats', handleGetStats);

  // Location data for map
  protectedApi.get('/locations', handleGetLocations);

  // Threat analysis
  protectedApi.get('/threats', handleGetThreats);
  protectedApi.post('/threats/rescan', adminMiddleware, handleRescanThreats);

  // Filter options
  protectedApi.get('/domains', handleGetDomains);
  protectedApi.get('/countries', handleGetCountries);

  // System status
  protectedApi.get('/status', handleGetStatus);

  // Geo processing trigger
  protectedApi.post('/geo/process', adminMiddleware, handleProcessGeo);

  // Admin-only: invite users
  protectedApi.post('/admin/invite', adminMiddleware, handleAdminInvite);

  api.route('/', protectedApi);

  return api;
}

module.exports = { createApiRoutes };
