#!/usr/bin/env node
/**
 * CLI script to promote a user to admin
 * Usage: node scripts/promote-admin.js <email>
 *
 * Docker: docker exec web-traffic-map node scripts/promote-admin.js admin@example.com
 */

const path = require('path');
const fs = require('fs');

if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(process.cwd(), 'data', 'traffic.db');
}

const dbPath = process.env.DB_PATH;
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const { initDatabase } = require('../src/db/schema');
const { getUserByEmail, promoteToAdmin } = require('../src/db/queries');

function main() {
  const email = process.argv[2];

  if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/promote-admin.js <email>');
    console.error('Example: node scripts/promote-admin.js admin@example.com');
    process.exit(1);
  }

  initDatabase();

  const user = getUserByEmail(email);
  if (!user) {
    console.error(`Error: No user found with email ${email}`);
    console.error('The user must register first before being promoted to admin.');
    process.exit(1);
  }

  if (user.is_admin) {
    console.log(`User ${email} is already an admin.`);
    process.exit(0);
  }

  promoteToAdmin(email);
  console.log(`User ${email} has been promoted to admin.`);
  console.log('They need to log out and log back in for the change to take effect.');
}

main();
