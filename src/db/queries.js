/**
 * Database query functions for log storage and retrieval
 * @module db/queries
 */

const { getDatabase } = require('./schema');

/**
 * Insert a log entry into the database
 * @param {Object} entry - Parsed log entry
 * @returns {Database.RunResult} Insert result
 */
function insertLog(entry) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO logs (
      timestamp, timestamp_unix, status, upstream_status, method,
      protocol, host, path, client_ip, response_length,
      gzip_ratio, backend, user_agent, referer, device_type
    ) VALUES (
      @timestamp, @timestamp_unix, @status, @upstream_status, @method,
      @protocol, @host, @path, @client_ip, @response_length,
      @gzip_ratio, @backend, @user_agent, @referer, @device_type
    )
  `);
  return stmt.run(entry);
}

/**
 * Insert multiple log entries in a transaction
 * @param {Array<Object>} entries - Array of parsed log entries
 * @returns {number} Number of entries inserted
 */
function insertLogs(entries) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO logs (
      timestamp, timestamp_unix, status, upstream_status, method,
      protocol, host, path, client_ip, response_length,
      gzip_ratio, backend, user_agent, referer, device_type
    ) VALUES (
      @timestamp, @timestamp_unix, @status, @upstream_status, @method,
      @protocol, @host, @path, @client_ip, @response_length,
      @gzip_ratio, @backend, @user_agent, @referer, @device_type
    )
  `);

  const insertMany = db.transaction((entries) => {
    for (const entry of entries) {
      stmt.run(entry);
    }
    return entries.length;
  });

  return insertMany(entries);
}

/**
 * Query logs with filters
 * @param {Object} filters - Query filters
 * @param {string} [filters.host] - Filter by host/domain
 * @param {string} [filters.device_type] - Filter by device type
 * @param {string} [filters.start_date] - Start date (ISO string)
 * @param {string} [filters.end_date] - End date (ISO string)
 * @param {string} [filters.ip] - Filter by IP address
 * @param {string} [filters.country] - Filter by country code
 * @param {boolean} [filters.home_only] - Only show "/" requests
 * @param {number} [filters.limit] - Max results (default 1000)
 * @param {number} [filters.offset] - Offset for pagination
 * @returns {Array<Object>} Matching log entries with geo data
 */
function queryLogs(filters = {}) {
  const db = getDatabase();
  const conditions = [];
  const params = {};

  if (filters.host) {
    conditions.push('l.host = @host');
    params.host = filters.host;
  }

  if (filters.device_type) {
    conditions.push('l.device_type = @device_type');
    params.device_type = filters.device_type;
  }

  if (filters.start_date) {
    conditions.push('l.timestamp_unix >= @start_unix');
    const startDate = filters.start_date.includes('T') ? filters.start_date : filters.start_date + 'T00:00:00';
    params.start_unix = Math.floor(new Date(startDate).getTime() / 1000);
  }

  if (filters.end_date) {
    conditions.push('l.timestamp_unix <= @end_unix');
    const endDate = filters.end_date.includes('T') ? filters.end_date : filters.end_date + 'T23:59:59';
    params.end_unix = Math.floor(new Date(endDate).getTime() / 1000);
  }

  if (filters.ip) {
    conditions.push('l.client_ip LIKE @ip');
    params.ip = `%${filters.ip}%`;
  }

  if (filters.country) {
    conditions.push('g.country_code = @country');
    params.country = filters.country;
  }

  if (filters.region) {
    conditions.push('g.region = @region');
    params.region = filters.region;
  }

  if (filters.city) {
    conditions.push('g.city = @city');
    params.city = filters.city;
  }

  if (filters.home_only) {
    conditions.push("(l.path = '/' OR l.path LIKE '/?%')");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 1000;
  const offset = filters.offset || 0;

  const sql = `
    SELECT
      l.*,
      g.country,
      g.country_code,
      g.region,
      g.city,
      g.latitude,
      g.longitude,
      g.isp,
      g.country_flag
    FROM logs l
    LEFT JOIN geo_cache g ON l.client_ip = g.ip
    ${whereClause}
    ORDER BY l.timestamp_unix DESC
    LIMIT @limit OFFSET @offset
  `;

  params.limit = limit;
  params.offset = offset;

  return db.prepare(sql).all(params);
}

/**
 * Get aggregated statistics
 * @param {Object} filters - Same filters as queryLogs
 * @returns {Object} Statistics object
 */
function getStats(filters = {}) {
  const db = getDatabase();
  const conditions = [];
  const params = {};

  if (filters.host) {
    conditions.push('l.host = @host');
    params.host = filters.host;
  }

  if (filters.device_type) {
    conditions.push('l.device_type = @device_type');
    params.device_type = filters.device_type;
  }

  if (filters.start_date) {
    conditions.push('l.timestamp_unix >= @start_unix');
    const startDate = filters.start_date.includes('T') ? filters.start_date : filters.start_date + 'T00:00:00';
    params.start_unix = Math.floor(new Date(startDate).getTime() / 1000);
  }

  if (filters.end_date) {
    conditions.push('l.timestamp_unix <= @end_unix');
    const endDate = filters.end_date.includes('T') ? filters.end_date : filters.end_date + 'T23:59:59';
    params.end_unix = Math.floor(new Date(endDate).getTime() / 1000);
  }

  if (filters.ip) {
    conditions.push('l.client_ip LIKE @ip');
    params.ip = `%${filters.ip}%`;
  }

  if (filters.country) {
    conditions.push('l.client_ip IN (SELECT ip FROM geo_cache WHERE country_code = @country)');
    params.country = filters.country;
  }

  if (filters.home_only) {
    conditions.push("(l.path = '/' OR l.path LIKE '/?%')");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Total requests
  const totalSql = `SELECT COUNT(*) as total FROM logs l ${whereClause}`;
  const { total } = db.prepare(totalSql).get(params);

  // Unique IPs
  const uniqueIpsSql = `SELECT COUNT(DISTINCT client_ip) as unique_ips FROM logs l ${whereClause}`;
  const { unique_ips } = db.prepare(uniqueIpsSql).get(params);

  // By device type
  const deviceSql = `
    SELECT device_type, COUNT(*) as count
    FROM logs l ${whereClause}
    GROUP BY device_type
  `;
  const byDevice = db.prepare(deviceSql).all(params);

  // By host
  const hostSql = `
    SELECT host, COUNT(*) as count
    FROM logs l ${whereClause}
    GROUP BY host
    ORDER BY count DESC
  `;
  const byHost = db.prepare(hostSql).all(params);

  // By country
  const countrySql = `
    SELECT g.country, g.country_code, g.country_flag, COUNT(*) as count
    FROM logs l
    LEFT JOIN geo_cache g ON l.client_ip = g.ip
    ${whereClause}
    GROUP BY g.country_code
    ORDER BY count DESC
    LIMIT 20
  `;
  const byCountry = db.prepare(countrySql).all(params);

  return {
    total,
    unique_ips,
    byDevice,
    byHost,
    byCountry
  };
}

/**
 * Get aggregated location data for map display
 * @param {Object} filters - Query filters
 * @param {string} level - Aggregation level: 'country', 'region', 'city', 'ip'
 * @returns {Array<Object>} Location data with counts
 */
function getLocationData(filters = {}, level = 'country') {
  const db = getDatabase();
  const conditions = [];
  const params = {};

  if (filters.host) {
    conditions.push('l.host = @host');
    params.host = filters.host;
  }

  if (filters.device_type) {
    conditions.push('l.device_type = @device_type');
    params.device_type = filters.device_type;
  }

  if (filters.start_date) {
    conditions.push('l.timestamp_unix >= @start_unix');
    const startDate = filters.start_date.includes('T') ? filters.start_date : filters.start_date + 'T00:00:00';
    params.start_unix = Math.floor(new Date(startDate).getTime() / 1000);
  }

  if (filters.end_date) {
    conditions.push('l.timestamp_unix <= @end_unix');
    const endDate = filters.end_date.includes('T') ? filters.end_date : filters.end_date + 'T23:59:59';
    params.end_unix = Math.floor(new Date(endDate).getTime() / 1000);
  }

  if (filters.country) {
    conditions.push('g.country_code = @country');
    params.country = filters.country;
  }

  if (filters.region) {
    conditions.push('g.region = @region');
    params.region = filters.region;
  }

  if (filters.city) {
    conditions.push('g.city = @city');
    params.city = filters.city;
  }

  if (filters.home_only) {
    conditions.push("(l.path = '/' OR l.path LIKE '/?%')");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let groupBy, selectFields;
  switch (level) {
    case 'region':
      groupBy = 'g.country_code, g.region';
      selectFields = 'g.country, g.country_code, g.region, AVG(g.latitude) as latitude, AVG(g.longitude) as longitude';
      break;
    case 'city':
      groupBy = 'g.country_code, g.region, g.city';
      selectFields = 'g.country, g.country_code, g.region, g.city, AVG(g.latitude) as latitude, AVG(g.longitude) as longitude';
      break;
    case 'ip':
      groupBy = 'l.client_ip';
      selectFields = 'l.client_ip, g.country, g.country_code, g.region, g.city, g.latitude, g.longitude';
      break;
    default: // country
      groupBy = 'g.country_code';
      selectFields = 'g.country, g.country_code, g.country_flag, AVG(g.latitude) as latitude, AVG(g.longitude) as longitude';
  }

  const sql = `
    SELECT
      ${selectFields},
      COUNT(*) as request_count,
      COUNT(DISTINCT l.client_ip) as unique_ips
    FROM logs l
    LEFT JOIN geo_cache g ON l.client_ip = g.ip
    ${whereClause}
    GROUP BY ${groupBy}
    HAVING g.latitude IS NOT NULL
    ORDER BY request_count DESC
  `;

  return db.prepare(sql).all(params);
}

/**
 * Get list of unique domains/hosts
 * @returns {Array<string>} List of hosts
 */
function getDomains() {
  const db = getDatabase();
  return db.prepare('SELECT DISTINCT host FROM logs WHERE host IS NOT NULL ORDER BY host').all();
}

/**
 * Get list of unique countries
 * @returns {Array<Object>} List of countries with codes and flags
 */
function getCountries() {
  const db = getDatabase();
  return db.prepare(`
    SELECT DISTINCT country, country_code, country_flag
    FROM geo_cache
    WHERE country IS NOT NULL
    ORDER BY country
  `).all();
}

/**
 * Get file position for incremental ingestion
 * @param {string} filePath - Path to log file
 * @returns {number} Byte offset
 */
function getFilePosition(filePath) {
  const db = getDatabase();
  const result = db.prepare('SELECT byte_offset FROM file_positions WHERE file_path = ?').get(filePath);
  return result ? result.byte_offset : 0;
}

/**
 * Update file position after ingestion
 * @param {string} filePath - Path to log file
 * @param {number} offset - New byte offset
 */
function setFilePosition(filePath, offset) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO file_positions (file_path, byte_offset, last_updated)
    VALUES (@filePath, @offset, CURRENT_TIMESTAMP)
    ON CONFLICT(file_path) DO UPDATE SET
      byte_offset = @offset,
      last_updated = CURRENT_TIMESTAMP
  `).run({ filePath, offset });
}

/**
 * Get cached geo data for an IP
 * @param {string} ip - IP address
 * @returns {Object|null} Geo data or null
 */
function getGeoCache(ip) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM geo_cache WHERE ip = ?').get(ip);
}

/**
 * Cache geo data for an IP
 * @param {string} ip - IP address
 * @param {Object} geoData - Geo data from API
 */
function setGeoCache(ip, geoData) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO geo_cache (
      ip, country, country_code, region, city,
      latitude, longitude, isp, timezone, country_flag
    ) VALUES (
      @ip, @country, @country_code, @region, @city,
      @latitude, @longitude, @isp, @timezone, @country_flag
    )
    ON CONFLICT(ip) DO UPDATE SET
      country = @country,
      country_code = @country_code,
      region = @region,
      city = @city,
      latitude = @latitude,
      longitude = @longitude,
      isp = @isp,
      timezone = @timezone,
      country_flag = @country_flag,
      cached_at = CURRENT_TIMESTAMP
  `).run({
    ip,
    country: geoData.country || null,
    country_code: geoData.country_code || null,
    region: geoData.region || null,
    city: geoData.city || null,
    latitude: geoData.latitude || null,
    longitude: geoData.longitude || null,
    isp: geoData.isp || null,
    timezone: geoData.timezone || null,
    country_flag: geoData.country_flag || null
  });
}

/**
 * Get IPs that need geolocation lookup
 * @param {number} limit - Max IPs to return
 * @returns {Array<string>} List of IPs without geo data
 */
function getIpsNeedingGeo(limit = 100) {
  const db = getDatabase();
  return db.prepare(`
    SELECT DISTINCT l.client_ip
    FROM logs l
    LEFT JOIN geo_cache g ON l.client_ip = g.ip
    WHERE g.ip IS NULL
    LIMIT ?
  `).all(limit).map(row => row.client_ip);
}

module.exports = {
  insertLog,
  insertLogs,
  queryLogs,
  getStats,
  getLocationData,
  getDomains,
  getCountries,
  getFilePosition,
  setFilePosition,
  getGeoCache,
  setGeoCache,
  getIpsNeedingGeo
};
