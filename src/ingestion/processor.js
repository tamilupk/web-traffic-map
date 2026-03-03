/**
 * Log processor module for incremental ingestion
 * Reads log files from last position and parses new entries
 * @module ingestion/processor
 */

const fs = require('fs');
const readline = require('readline');
const { parseLine } = require('../parser/nginx');
const { insertLogs, getFilePosition, setFilePosition } = require('../db/queries');
const { queueGeoLookups } = require('../geo/lookup');

/**
 * Process a log file from the beginning or last known position
 * @param {string} filePath - Path to log file
 * @param {boolean} fromStart - If true, start from beginning
 * @returns {Promise<number>} Number of entries processed
 */
async function processLogFile(filePath, fromStart = false) {
  let startOffset = fromStart ? 0 : getFilePosition(filePath);

  // Get file size
  const stats = fs.statSync(filePath);

  // Detect log rotation: file is smaller than our stored offset
  if (stats.size < startOffset) {
    console.log(`Log rotation detected for ${require('path').basename(filePath)}: file size ${stats.size} < stored offset ${startOffset}. Resetting to 0.`);
    startOffset = 0;
    setFilePosition(filePath, 0);
  }

  // No new content
  if (stats.size <= startOffset) {
    return 0;
  }

  return new Promise((resolve, reject) => {
    const entries = [];
    const ips = new Set();
    let bytesRead = startOffset;

    // Create read stream from offset
    const stream = fs.createReadStream(filePath, {
      start: startOffset,
      encoding: 'utf8'
    });

    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    // Handle partial line at start if resuming
    let isFirstLine = startOffset > 0;

    rl.on('line', (line) => {
      // Skip first partial line if resuming from middle
      if (isFirstLine && startOffset > 0) {
        isFirstLine = false;
        // If the offset was in the middle of a line, skip to next complete line
        // This is handled by the newline tracking in setFilePosition
      }

      bytesRead += Buffer.byteLength(line, 'utf8') + 1; // +1 for newline

      const entry = parseLine(line);
      if (entry) {
        entries.push(entry);
        ips.add(entry.client_ip);
      }
    });

    rl.on('close', () => {
      if (entries.length > 0) {
        try {
          insertLogs(entries);
          setFilePosition(filePath, bytesRead);

          // Queue geo lookups for new IPs
          queueGeoLookups([...ips]);
        } catch (error) {
          reject(error);
          return;
        }
      } else {
        setFilePosition(filePath, bytesRead);
      }

      resolve(entries.length);
    });

    rl.on('error', (error) => {
      reject(error);
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Process only new content added to a log file
 * @param {string} filePath - Path to log file
 * @returns {Promise<number>} Number of entries processed
 */
async function processNewContent(filePath) {
  return processLogFile(filePath, false);
}

/**
 * Reprocess a log file from the beginning
 * @param {string} filePath - Path to log file
 * @returns {Promise<number>} Number of entries processed
 */
async function reprocessLogFile(filePath) {
  // Reset position to start
  setFilePosition(filePath, 0);
  return processLogFile(filePath, true);
}

/**
 * Process all log files in the log directory
 * @param {string} logDir - Directory containing log files
 * @param {string} pattern - Glob pattern for log files
 * @returns {Promise<number>} Total entries processed
 */
async function processAllLogFiles(logDir, pattern) {
  const glob = require('path').join(logDir, pattern);
  const files = fs.readdirSync(logDir).filter(f =>
    f.match(/proxy-host-\d+_access\.log$/)
  );

  let totalProcessed = 0;
  for (const file of files) {
    const filePath = require('path').join(logDir, file);
    try {
      const count = await processLogFile(filePath);
      totalProcessed += count;
      if (count > 0) {
        console.log(`Processed ${count} entries from ${file}`);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  return totalProcessed;
}

module.exports = {
  processLogFile,
  processNewContent,
  reprocessLogFile,
  processAllLogFiles
};
