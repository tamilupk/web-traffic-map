/**
 * File watcher module for nginx log monitoring
 * Uses chokidar to watch for log file changes
 * @module ingestion/watcher
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { config } = require('../config');
const { processLogFile, processNewContent } = require('./processor');

/** @type {chokidar.FSWatcher|null} */
let watcher = null;

/** @type {Set<string>} */
let watchedFiles = new Set();

/**
 * Get log files matching the pattern in a directory
 * @param {string} dir - Directory to scan
 * @param {string} pattern - File pattern (e.g., 'proxy-host-*_access.log')
 * @returns {Array<string>} Array of absolute file paths
 */
function discoverLogFiles(dir, pattern) {
  if (!fs.existsSync(dir)) {
    console.warn(`Log directory does not exist: ${dir}`);
    return [];
  }

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);

  const files = fs.readdirSync(dir)
    .filter(f => regex.test(f))
    .map(f => path.resolve(dir, f));

  return files;
}

/**
 * Start watching log files for changes
 * @param {Function} onNewEntries - Callback when new entries are ingested
 * @returns {chokidar.FSWatcher} The watcher instance
 */
function startWatcher(onNewEntries = null) {
  if (watcher) {
    console.log('Watcher already running');
    return watcher;
  }

  console.log(`Starting watcher for: ${config.logDir}/${config.logPattern}`);

  // Discover existing log files
  const existingFiles = discoverLogFiles(config.logDir, config.logPattern);
  console.log(`Found ${existingFiles.length} existing log files`);

  // Process existing files
  existingFiles.forEach(async (filePath) => {
    console.log(`Discovered log file: ${path.basename(filePath)}`);
    watchedFiles.add(filePath);
    try {
      const count = await processLogFile(filePath);
      if (count > 0) {
        console.log(`Ingested ${count} entries from ${path.basename(filePath)}`);
        if (onNewEntries) onNewEntries(count, filePath);
      }
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
    }
  });

  // Watch the directory for changes (both existing files and new ones)
  watcher = chokidar.watch(config.logDir, {
    persistent: true,
    ignoreInitial: true, // We already processed existing files
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    },
    usePolling: false,
    depth: 0 // Only watch files directly in the directory
  });

  // Convert pattern to regex for filtering
  const patternRegex = new RegExp(
    '^' + config.logPattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
  );

  watcher.on('add', async (filePath) => {
    const fileName = path.basename(filePath);
    if (!patternRegex.test(fileName)) return;
    if (watchedFiles.has(filePath)) return;

    console.log(`New log file detected: ${fileName}`);
    watchedFiles.add(filePath);

    try {
      const count = await processLogFile(filePath);
      if (count > 0) {
        console.log(`Ingested ${count} entries from ${fileName}`);
        if (onNewEntries) onNewEntries(count, filePath);
      }
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
    }
  });

  watcher.on('change', async (filePath) => {
    const fileName = path.basename(filePath);
    if (!patternRegex.test(fileName)) return;

    console.log(`Log file changed: ${fileName}`);
    try {
      const count = await processNewContent(filePath);
      if (count > 0) {
        console.log(`Ingested ${count} new entries from ${fileName}`);
        if (onNewEntries) onNewEntries(count, filePath);
      }
    } catch (error) {
      console.error(`Error processing changes in ${filePath}:`, error.message);
    }
  });

  watcher.on('unlink', (filePath) => {
    const fileName = path.basename(filePath);
    if (!patternRegex.test(fileName)) return;

    console.log(`Log file removed: ${fileName}`);
    watchedFiles.delete(filePath);
  });

  watcher.on('error', (error) => {
    console.error('Watcher error:', error);
  });

  watcher.on('ready', () => {
    console.log('Watcher ready, monitoring for changes...');
  });

  return watcher;
}

/**
 * Stop the file watcher
 */
async function stopWatcher() {
  if (watcher) {
    await watcher.close();
    watcher = null;
    watchedFiles.clear();
    console.log('Watcher stopped');
  }
}

/**
 * Get watcher status
 * @returns {Object} Watcher status
 */
function getWatcherStatus() {
  return {
    running: watcher !== null,
    files: [...watchedFiles]
  };
}

module.exports = {
  startWatcher,
  stopWatcher,
  getWatcherStatus
};
