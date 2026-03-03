#!/usr/bin/env node
/**
 * CLI script to generate invite tokens for user registration
 *
 * Usage:
 *   node scripts/invite.js <email>
 *
 * Docker:
 *   docker exec web-traffic-map node scripts/invite.js admin@example.com
 */

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Resolve DB path: env var > ./data/traffic.db
if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(process.cwd(), 'data', 'traffic.db');
}

const dbPath = process.env.DB_PATH;
const dbDir = path.dirname(dbPath);

// Ensure data directory exists (handles first-run on fresh prod deployment)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created data directory: ${dbDir}`);
}

const { initDatabase } = require('../src/db/schema');
const { createInviteToken, getUserByEmail } = require('../src/db/queries');

function main() {
  const email = process.argv[2];

  if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/invite.js <email>');
    console.error('Example: node scripts/invite.js admin@example.com');
    console.error('\nDocker: docker exec web-traffic-map node scripts/invite.js admin@example.com');
    process.exit(1);
  }

  // Initialize database — creates all tables if they don't exist
  const isNew = !fs.existsSync(dbPath);
  initDatabase();
  if (isNew) {
    console.log(`Database created at ${dbPath}`);
  } else {
    console.log(`Database: ${dbPath} (auth tables verified)`);
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Check if user already exists
  const existingUser = getUserByEmail(email);
  if (existingUser) {
    console.log(`Note: User with email ${email} already exists (id: ${existingUser.id}).`);
    console.log('This invite will allow them to register an additional passkey.\n');
  }

  createInviteToken(email, token, expiresAt);

  const port = process.env.PORT || 3000;
  const origin = process.env.WEBAUTHN_ORIGIN || `http://localhost:${port}`;

  console.log('\nInvite token created successfully!\n');
  console.log(`  Email:   ${email}`);
  console.log(`  Token:   ${token}`);
  console.log(`  Expires: ${expiresAt}\n`);
  console.log('Registration URL:');
  console.log(`  ${origin}/register?token=${token}`);
  console.log('\nShare this URL with the user.');
}

main();
