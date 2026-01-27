/**
 * API request handlers
 * Contains the logic for each API endpoint
 * @module api/handlers
 */

const {
  queryLogs,
  getStats,
  getLocationData,
  getDomains,
  getCountries,
  getThreatTimeline,
  resetThreatAnalysis
} = require('../db/queries');
const { getWatcherStatus } = require('../ingestion/watcher');
const { getQueueStatus, processUngelocatedIps } = require('../geo/lookup');
const { triggerThreatScan } = require('../ingestion/threat-worker');

/**
 * Handle GET /api/threats
 * Returns timeline of identified threats
 */
function handleGetThreats(c) {
  try {
    const timeline = getThreatTimeline(100);
    return c.json({
      success: true,
      data: timeline
    });
  } catch (error) {
    console.error('Error getting threats:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle POST /api/threats/rescan
 * Resets threat analysis and triggers full scan
 */
async function handleRescanThreats(c) {
  try {
    resetThreatAnalysis();
    // Trigger the worker catch-up immediately
    triggerThreatScan();
    
    return c.json({
      success: true,
      message: 'Threat analysis reset. Worker has begun full rescan.'
    });
  } catch (error) {
    console.error('Error resetting threats:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle GET /api/logs
 * Returns filtered log entries with geo data
 * @param {Context} c - Hono context
 * @returns {Response} JSON response
 */
function handleGetLogs(c) {
  const filters = {
    host: c.req.query('host'),
    device_type: c.req.query('device_type'),
    start_date: c.req.query('start_date'),
    end_date: c.req.query('end_date'),
    ip: c.req.query('ip'),
    country: c.req.query('country'),
    region: c.req.query('region'),
    city: c.req.query('city'),
    home_only: c.req.query('home_only') === 'true',
    limit: parseInt(c.req.query('limit'), 10) || 1000,
    offset: parseInt(c.req.query('offset'), 10) || 0
  };

  // Remove undefined/null filters
  Object.keys(filters).forEach(key => {
    if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
      delete filters[key];
    }
  });

  try {
    const logs = queryLogs(filters);
    return c.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('Error querying logs:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle GET /api/stats
 * Returns aggregated statistics
 * @param {Context} c - Hono context
 * @returns {Response} JSON response
 */
function handleGetStats(c) {
  const filters = {
    host: c.req.query('host'),
    device_type: c.req.query('device_type'),
    start_date: c.req.query('start_date'),
    end_date: c.req.query('end_date'),
    ip: c.req.query('ip'),
    country: c.req.query('country'),
    home_only: c.req.query('home_only') === 'true'
  };

  // Remove undefined/null filters
  Object.keys(filters).forEach(key => {
    if (filters[key] === undefined || filters[key] === null || filters[key] === '' || filters[key] === false) {
      delete filters[key];
    }
  });

  try {
    const stats = getStats(filters);
    return c.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle GET /api/locations
 * Returns aggregated location data for map display
 * @param {Context} c - Hono context
 * @returns {Response} JSON response
 */
function handleGetLocations(c) {
  const level = c.req.query('level') || 'country';
  const filters = {
    host: c.req.query('host'),
    device_type: c.req.query('device_type'),
    start_date: c.req.query('start_date'),
    end_date: c.req.query('end_date'),
    country: c.req.query('country'),
    region: c.req.query('region'),
    city: c.req.query('city'),
    home_only: c.req.query('home_only') === 'true'
  };

  // Remove undefined/null filters
  Object.keys(filters).forEach(key => {
    if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
      delete filters[key];
    }
  });

  try {
    const locations = getLocationData(filters, level);
    return c.json({
      success: true,
      level,
      count: locations.length,
      data: locations
    });
  } catch (error) {
    console.error('Error getting locations:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle GET /api/domains
 * Returns list of unique domains
 * @param {Context} c - Hono context
 * @returns {Response} JSON response
 */
function handleGetDomains(c) {
  try {
    const domains = getDomains();
    return c.json({
      success: true,
      data: domains.map(d => d.host)
    });
  } catch (error) {
    console.error('Error getting domains:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle GET /api/countries
 * Returns list of unique countries
 * @param {Context} c - Hono context
 * @returns {Response} JSON response
 */
function handleGetCountries(c) {
  try {
    const countries = getCountries();
    return c.json({
      success: true,
      data: countries
    });
  } catch (error) {
    console.error('Error getting countries:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle GET /api/status
 * Returns system status (watcher, geo queue)
 * @param {Context} c - Hono context
 * @returns {Response} JSON response
 */
function handleGetStatus(c) {
  try {
    const watcher = getWatcherStatus();
    const geoQueue = getQueueStatus();

    return c.json({
      success: true,
      data: {
        watcher,
        geoQueue
      }
    });
  } catch (error) {
    console.error('Error getting status:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

/**
 * Handle POST /api/geo/process
 * Triggers geo processing for ungelocated IPs
 * @param {Context} c - Hono context
 * @returns {Response} JSON response
 */
async function handleProcessGeo(c) {
  try {
    const count = await processUngelocatedIps(50);
    return c.json({
      success: true,
      processed: count
    });
  } catch (error) {
    console.error('Error processing geo:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
}

module.exports = {
  handleGetLogs,
  handleGetStats,
  handleGetLocations,
  handleGetDomains,
  handleGetCountries,
  handleGetStatus,
  handleProcessGeo,
  handleGetThreats,
  handleRescanThreats
};
