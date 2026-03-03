/**
 * Programmatic migration runner — bypasses node-pg-migrate CLI's built-in dotenv
 * which reads DATABASE_URL from .env before our config file runs.
 * Uses container env vars directly (DB_HOST, DB_PORT, etc.) via connection object.
 */
const runner = require('node-pg-migrate').default;
const path = require('path');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'nursery_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

console.log(`Running migrations → ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} as ${dbConfig.user}`);

runner({
  databaseUrl: dbConfig,
  dir: path.join(__dirname, 'migrations'),
  direction: 'up',
  count: Infinity,
  migrationsTable: 'pgmigrations',
  createSchema: true,
  createMigrationsSchema: true,
  checkOrder: true,
  log: console.log,
})
  .then(() => {
    console.log('Migrations completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
