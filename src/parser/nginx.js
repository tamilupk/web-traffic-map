/**
 * Nginx log parser module
 * Parses custom nginx proxy log format into structured data
 * @module parser/nginx
 */

const { detectDeviceType } = require('./useragent');

/**
 * Regular expression to parse nginx log lines
 * Format: [timestamp] - status upstream_status - METHOD protocol host "path" [Client IP] [Length bytes] [Gzip ratio] [Sent-to backend] "User-Agent" "Referer"
 */
const LOG_REGEX = /^\[([^\]]+)\] - (\d+) (\d+|-) - (\w+) (\w+) ([^\s]+) "([^"]*)" \[Client ([^\]]+)\] \[Length ([^\]]+)\] \[Gzip ([^\]]+)\] \[Sent-to ([^\]]+)\] "([^"]*)" "([^"]*)"/;

/**
 * Parse nginx timestamp to Date object and Unix timestamp
 * @param {string} timestamp - Nginx timestamp format: "24/Jan/2026:21:35:47 -0500"
 * @returns {Object} Object with date string and unix timestamp
 */
function parseTimestamp(timestamp) {
  // Format: "24/Jan/2026:21:35:47 -0500"
  const months = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };

  const match = timestamp.match(/(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+)\s*([+-]\d{4})/);
  if (!match) {
    return { timestamp: timestamp, timestamp_unix: 0 };
  }

  const [, day, month, year, hour, minute, second, tz] = match;

  // Parse timezone offset
  const tzSign = tz[0] === '-' ? -1 : 1;
  const tzHours = parseInt(tz.slice(1, 3), 10);
  const tzMinutes = parseInt(tz.slice(3, 5), 10);
  const tzOffset = tzSign * (tzHours * 60 + tzMinutes);

  const date = new Date(Date.UTC(
    parseInt(year, 10),
    months[month],
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  ));

  // Adjust for timezone
  date.setMinutes(date.getMinutes() - tzOffset);

  return {
    timestamp: date.toISOString(),
    timestamp_unix: Math.floor(date.getTime() / 1000)
  };
}

/**
 * Parse a single nginx log line
 * @param {string} line - Raw log line
 * @returns {Object|null} Parsed log entry or null if invalid
 */
function parseLine(line) {
  if (!line || !line.trim()) {
    return null;
  }

  const match = line.match(LOG_REGEX);
  if (!match) {
    return null;
  }

  const [, rawTimestamp, status, upstreamStatus, method, protocol, host, path,
         clientIp, length, gzip, backend, userAgent, referer] = match;

  const { timestamp, timestamp_unix } = parseTimestamp(rawTimestamp);

  // Parse numeric fields
  const parsedStatus = parseInt(status, 10) || null;
  const parsedUpstreamStatus = upstreamStatus === '-' ? null : parseInt(upstreamStatus, 10);
  const parsedLength = parseInt(length, 10) || 0;
  const parsedGzip = gzip === '-' ? null : parseFloat(gzip);

  // Detect device type from user agent
  const deviceType = detectDeviceType(userAgent);

  return {
    timestamp,
    timestamp_unix,
    status: parsedStatus,
    upstream_status: parsedUpstreamStatus,
    method,
    protocol,
    host,
    path,
    client_ip: clientIp,
    response_length: parsedLength,
    gzip_ratio: parsedGzip,
    backend,
    user_agent: userAgent,
    referer: referer === '-' ? null : referer,
    device_type: deviceType
  };
}

/**
 * Parse multiple log lines
 * @param {string} content - Raw log content (multiple lines)
 * @returns {Array<Object>} Array of parsed log entries
 */
function parseContent(content) {
  const lines = content.split('\n');
  const entries = [];

  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

module.exports = {
  parseLine,
  parseContent,
  parseTimestamp,
  LOG_REGEX
};
