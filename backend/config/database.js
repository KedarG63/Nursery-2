const { Pool } = require('pg');
const logger = require('./logger');

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'nursery_db',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),

  // Phase 18: Enhanced connection pool settings
  min: parseInt(process.env.DB_POOL_MIN) || 2, // Minimum connections
  max: parseInt(process.env.DB_POOL_MAX) || 20, // Maximum connections
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000, // Close idle connections after 30s
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // Timeout after 10s

  // Performance settings
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000, // Kill queries after 30 seconds
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 30000,

  // Keep-alive to prevent connection drops
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

const pool = new Pool(poolConfig);

// Event listeners for pool
pool.on('connect', () => {
  logger.info('Database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', { error: err.message, stack: err.stack });
  process.exit(-1);
});

// Phase 18: Log pool statistics every minute
setInterval(() => {
  logger.info('Database pool stats', {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
}, 60000);

module.exports = pool;
