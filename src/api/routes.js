/**
 * API routes configuration
 * Defines all REST API endpoints
 * @module api/routes
 */

const { Hono } = require('hono');
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
 * @returns {Hono} Configured Hono router
 */
function createApiRoutes() {
  const api = new Hono();

  // Log queries
  api.get('/logs', handleGetLogs);

  // Statistics
  api.get('/stats', handleGetStats);

  // Location data for map
  api.get('/locations', handleGetLocations);

  // Threat analysis
  api.get('/threats', handleGetThreats);
  api.post('/threats/rescan', handleRescanThreats);

  // Filter options
  api.get('/domains', handleGetDomains);
  api.get('/countries', handleGetCountries);

  // System status
  api.get('/status', handleGetStatus);

  // Geo processing trigger
  api.post('/geo/process', handleProcessGeo);

  return api;
}

module.exports = { createApiRoutes };
