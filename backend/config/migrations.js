const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Rebuild DATABASE_URL from individual components so DB_HOST (injected by Docker Compose
// as 'postgres') takes precedence over the localhost URL that may be in .env file.
// node-pg-migrate prefers DATABASE_URL env var over databaseUrl in this config file,
// so we must override it here after dotenv has run.
process.env.DATABASE_URL = `postgresql://${process.env.DB_USER || 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'Nursery_management_software'}`;

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  migrationsTable: 'pgmigrations',
  dir: 'migrations',
  direction: 'up',
  count: Infinity,
  createSchema: true,
  createMigrationsSchema: true,
  checkOrder: true,
};
