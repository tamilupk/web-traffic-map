/**
 * Database schema initialization module
 * Creates SQLite tables for log storage, file tracking, and geo caching
 * @module db/schema
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { config } = require('../config');

/** @type {Database.Database|null} */
let db = null;

/**
 * Initialize the database connection and create tables
 * @returns {Database.Database} The database instance
 */
function initDatabase() {
  if (db) return db;

  // Ensure data directory exists
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  createTables();
  createIndexes();

  return db;
}

/**
 * Create all required database tables
 */
function createTables() {
  // Main logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      timestamp_unix INTEGER NOT NULL,
      status INTEGER,
      upstream_status INTEGER,
      method TEXT,
      protocol TEXT,
      host TEXT,
      path TEXT,
      client_ip TEXT NOT NULL,
      response_length INTEGER,
      gzip_ratio REAL,
      backend TEXT,
      user_agent TEXT,
      referer TEXT,
      device_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // File positions for incremental ingestion
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_positions (
      file_path TEXT PRIMARY KEY,
      byte_offset INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Geo cache for IP lookups
  db.exec(`
    CREATE TABLE IF NOT EXISTS geo_cache (
      ip TEXT PRIMARY KEY,
      country TEXT,
      country_code TEXT,
      region TEXT,
      city TEXT,
      latitude REAL,
      longitude REAL,
      isp TEXT,
      timezone TEXT,
      country_flag TEXT,
      cached_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Create indexes for efficient querying
 */
function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp_unix);
    CREATE INDEX IF NOT EXISTS idx_logs_host ON logs(host);
    CREATE INDEX IF NOT EXISTS idx_logs_client_ip ON logs(client_ip);
    CREATE INDEX IF NOT EXISTS idx_logs_device_type ON logs(device_type);
    CREATE INDEX IF NOT EXISTS idx_logs_path ON logs(path);
    CREATE INDEX IF NOT EXISTS idx_logs_status ON logs(status);
    CREATE INDEX IF NOT EXISTS idx_geo_cache_country ON geo_cache(country_code);
  `);
}

/**
 * Get the database instance
 * @returns {Database.Database} The database instance
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close the database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase
};
