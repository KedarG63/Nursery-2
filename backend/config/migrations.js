const path = require('path');

// Load .env only if DB_HOST is not already set by Docker Compose (or another environment).
// This allows Docker Compose to inject DB_HOST=postgres without it being overridden by
// the localhost value in the .env file baked into the image.
if (!process.env.DB_HOST) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

// Rebuild DATABASE_URL so it always reflects the active DB_HOST.
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
