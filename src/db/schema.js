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
  runMigrations();

  return db;
}

/**
 * Run database migrations
 */
function runMigrations() {
  // Check if explanation column exists in threat_incidents
  const tableInfo = db.prepare("PRAGMA table_info(threat_incidents)").all();
  const hasExplanation = tableInfo.some(col => col.name === 'explanation');
  const hasHost = tableInfo.some(col => col.name === 'host');

  if (!hasExplanation) {
    console.log('Migrating database: adding explanation column to threat_incidents');
    db.exec("ALTER TABLE threat_incidents ADD COLUMN explanation TEXT");
  }

  if (!hasHost) {
    console.log('Migrating database: adding host column to threat_incidents');
    db.exec("ALTER TABLE threat_incidents ADD COLUMN host TEXT");
  }

  // Check if is_admin column exists in users
  const usersInfo = db.prepare("PRAGMA table_info(users)").all();
  if (usersInfo.length > 0 && !usersInfo.some(col => col.name === 'is_admin')) {
    console.log('Migrating database: adding is_admin column to users');
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }
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

  // Cached geolocation data used by map queries and background lookups
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

  // File positions for incremental ingestion
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_positions (
      file_path TEXT PRIMARY KEY,
      byte_offset INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Threat incidents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS threat_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      host TEXT,
      incident_date TEXT NOT NULL,
      incident_unix INTEGER NOT NULL,
      risk_score INTEGER DEFAULT 0,
      threat_level TEXT DEFAULT 'low',
      summary TEXT,
      explanation TEXT,
      details TEXT, -- JSON array of findings
      request_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // App state for tracking scans
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Passkey credentials (one user can have many passkeys)
  db.exec(`
    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Invite tokens for registration
  db.exec(`
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ephemeral WebAuthn challenges
  db.exec(`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('registration', 'authentication')),
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    CREATE INDEX IF NOT EXISTS idx_threat_incidents_unix ON threat_incidents(incident_unix);
    CREATE INDEX IF NOT EXISTS idx_threat_incidents_ip ON threat_incidents(ip);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id ON passkey_credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_passkey_credentials_credential_id ON passkey_credentials(credential_id);
    CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_challenge ON webauthn_challenges(challenge);
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
