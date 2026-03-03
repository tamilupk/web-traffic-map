/**
 * API routes configuration
 * Defines all REST API endpoints with auth middleware on protected routes
 * @module api/routes
 */

const { Hono } = require('hono');
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

  // Log queries
  protectedApi.get('/logs', handleGetLogs);

  // Statistics
  protectedApi.get('/stats', handleGetStats);

  // Location data for map
  protectedApi.get('/locations', handleGetLocations);

  // Threat analysis
  protectedApi.get('/threats', handleGetThreats);
  protectedApi.post('/threats/rescan', handleRescanThreats);

  // Filter options
  protectedApi.get('/domains', handleGetDomains);
  protectedApi.get('/countries', handleGetCountries);

  // System status
  protectedApi.get('/status', handleGetStatus);

  // Geo processing trigger
  protectedApi.post('/geo/process', handleProcessGeo);

  // Admin-only: invite users
  protectedApi.post('/admin/invite', adminMiddleware, handleAdminInvite);

  api.route('/', protectedApi);

  return api;
}

module.exports = { createApiRoutes };
