/**
 * Web Traffic Map - Main entry point
 * Initializes database, starts file watcher, and serves API + frontend
 * @module index
 */

const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');
const { cors } = require('hono/cors');
const { logger } = require('hono/logger');
const path = require('path');

const { config } = require('./config');
const { initDatabase, closeDatabase } = require('./db/schema');
const { createApiRoutes } = require('./api/routes');
const { startWatcher, stopWatcher } = require('./ingestion/watcher');
const { processUngelocatedIps } = require('./geo/lookup');

/**
 * Create and configure the Hono application
 * @returns {Hono} Configured Hono app
 */
function createApp() {
  const app = new Hono();

  // Middleware
  app.use('*', logger());
  app.use('*', cors());

  // API routes
  app.route('/api', createApiRoutes());

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Serve static files from public directory
  app.use('/*', serveStatic({ root: './public' }));

  // Fallback to index.html for SPA routing
  app.get('*', serveStatic({ path: './public/index.html' }));

  return app;
}

/**
 * Initialize and start the application
 */
async function main() {
  console.log('='.repeat(50));
  console.log('Web Traffic Map Server');
  console.log('='.repeat(50));

  // Initialize database
  console.log('\nInitializing database...');
  initDatabase();
  console.log(`Database: ${config.dbPath}`);

  // Start file watcher
  console.log('\nStarting log file watcher...');
  startWatcher(async (count, filePath) => {
    console.log(`[Watcher] Ingested ${count} entries from ${path.basename(filePath)}`);
    // Process geo data immediately for new IPs
    const geoProcessed = await processUngelocatedIps(count + 10);
    if (geoProcessed > 0) {
      console.log(`[Geo] Processed ${geoProcessed} new IPs`);
    }
  });
  console.log(`Watching: ${config.logDir}/${config.logPattern}`);

  // Process any ungelocated IPs in the background
  setTimeout(async () => {
    console.log('\nProcessing ungelocated IPs...');
    const processed = await processUngelocatedIps(100);
    if (processed > 0) {
      console.log(`Geo data fetched for ${processed} IPs`);
    }
  }, 2000);

  // Backup: periodically process any missed ungelocated IPs every 5 minutes
  setInterval(async () => {
    const processed = await processUngelocatedIps(50);
    if (processed > 0) {
      console.log(`[Geo] Backup processed ${processed} IPs`);
    }
  }, 300000);

  // Create and start server
  const app = createApp();

  console.log(`\nStarting server on port ${config.port}...`);
  serve({
    fetch: app.fetch,
    port: config.port
  }, (info) => {
    console.log(`\nServer running at http://localhost:${info.port}`);
    console.log('\nAPI Endpoints:');
    console.log('  GET  /api/logs       - Query log entries');
    console.log('  GET  /api/stats      - Get statistics');
    console.log('  GET  /api/locations  - Get map location data');
    console.log('  GET  /api/domains    - List domains');
    console.log('  GET  /api/countries  - List countries');
    console.log('  GET  /api/status     - System status');
    console.log('  POST /api/geo/process - Process pending geo lookups');
    console.log('\n' + '='.repeat(50));
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await stopWatcher();
    closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await stopWatcher();
    closeDatabase();
    process.exit(0);
  });
}

// Run the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
