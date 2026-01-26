/**
 * Configuration module for Web Traffic Map
 * Loads settings from environment variables with sensible defaults
 * @module config
 */

const path = require('path');

/**
 * Application configuration object
 * @type {Object}
 */
const config = {
  /** Server port */
  port: parseInt(process.env.PORT, 10) || 3000,

  /** SQLite database path */
  dbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'traffic.db'),

  /** Directory containing nginx log files */
  logDir: process.env.LOG_DIR || path.join(process.cwd(), 'nginx-logs'),

  /** Log file pattern to watch */
  logPattern: 'proxy-host-*_access.log',

  /** Geolocation API endpoint */
  geoApiUrl: 'https://ipwhois.app/json',

  /** Rate limit delay between geo API calls (ms) */
  geoRateLimit: 100,

  /** Private IP ranges to skip geolocation */
  privateIpRanges: [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^::1$/,
    /^localhost$/
  ]
};

/**
 * Check if an IP address is private/local
 * @param {string} ip - IP address to check
 * @returns {boolean} True if IP is private
 */
function isPrivateIp(ip) {
  return config.privateIpRanges.some(range => range.test(ip));
}

module.exports = { config, isPrivateIp };
