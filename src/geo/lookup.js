/**
 * IP Geolocation lookup module
 * Uses ipwhois.app API with SQLite caching
 * @module geo/lookup
 */

const { config, isPrivateIp } = require('../config');
const { getGeoCache, setGeoCache, getIpsNeedingGeo } = require('../db/queries');

/**
 * Queue for rate-limited geo lookups
 */
let lookupQueue = [];
let isProcessing = false;

/**
 * Fetch geo data from ipwhois.app API
 * @param {string} ip - IP address to lookup
 * @returns {Promise<Object|null>} Geo data or null on error
 */
async function fetchGeoData(ip) {
  try {
    const response = await fetch(`${config.geoApiUrl}/${ip}`);
    if (!response.ok) {
      console.error(`Geo API error for ${ip}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.success && data.success !== undefined) {
      console.error(`Geo API failed for ${ip}: ${data.message}`);
      return null;
    }

    return {
      country: data.country || null,
      country_code: data.country_code || null,
      region: data.region || null,
      city: data.city || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      isp: data.isp || null,
      timezone: data.timezone || null,
      country_flag: data.country_flag ? data.country_flag.emoji : null
    };
  } catch (error) {
    console.error(`Geo lookup error for ${ip}:`, error.message);
    return null;
  }
}

/**
 * Get geo data for an IP address (cached or fresh)
 * @param {string} ip - IP address
 * @returns {Promise<Object|null>} Geo data
 */
async function getGeoData(ip) {
  // Skip private IPs
  if (isPrivateIp(ip)) {
    return {
      country: 'Private',
      country_code: 'XX',
      region: 'Local',
      city: 'Local',
      latitude: 0,
      longitude: 0,
      isp: 'Private Network',
      timezone: null,
      country_flag: null
    };
  }

  // Check cache first
  const cached = getGeoCache(ip);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const geoData = await fetchGeoData(ip);
  if (geoData) {
    setGeoCache(ip, geoData);
  }

  return geoData;
}

/**
 * Process pending geo lookups with rate limiting
 */
async function processGeoQueue() {
  if (isProcessing || lookupQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (lookupQueue.length > 0) {
    const ip = lookupQueue.shift();

    // Skip if already cached
    const cached = getGeoCache(ip);
    if (cached) {
      continue;
    }

    // Skip private IPs
    if (isPrivateIp(ip)) {
      continue;
    }

    await getGeoData(ip);

    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, config.geoRateLimit));
  }

  isProcessing = false;
}

/**
 * Queue an IP for geo lookup
 * @param {string} ip - IP address
 */
function queueGeoLookup(ip) {
  if (!lookupQueue.includes(ip) && !isPrivateIp(ip)) {
    lookupQueue.push(ip);
    processGeoQueue();
  }
}

/**
 * Queue multiple IPs for geo lookup
 * @param {Array<string>} ips - Array of IP addresses
 */
function queueGeoLookups(ips) {
  for (const ip of ips) {
    if (!lookupQueue.includes(ip) && !isPrivateIp(ip)) {
      lookupQueue.push(ip);
    }
  }
  processGeoQueue();
}

/**
 * Process all IPs in the database that need geo data
 * @param {number} batchSize - Number of IPs to process
 * @returns {Promise<number>} Number of IPs processed
 */
async function processUngelocatedIps(batchSize = 100) {
  const ips = getIpsNeedingGeo(batchSize);
  if (ips.length === 0) {
    return 0;
  }

  console.log(`Processing geo data for ${ips.length} IPs...`);

  let processed = 0;
  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      continue;
    }

    const geoData = await fetchGeoData(ip);
    if (geoData) {
      setGeoCache(ip, geoData);
      processed++;
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, config.geoRateLimit));
  }

  console.log(`Processed geo data for ${processed} IPs`);
  return processed;
}

/**
 * Get queue status
 * @returns {Object} Queue status
 */
function getQueueStatus() {
  return {
    pending: lookupQueue.length,
    isProcessing
  };
}

module.exports = {
  getGeoData,
  queueGeoLookup,
  queueGeoLookups,
  processUngelocatedIps,
  getQueueStatus
};
