/**
 * Test Database Utilities
 * Phase 19 - Testing Framework
 *
 * Utilities for managing test database connections, transactions, and cleanup
 */

const { Pool } = require('pg');

// Create a dedicated pool for testing
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Track test clients for cleanup
const activeClients = new Set();

/**
 * Get a database client for testing
 * @returns {Promise<Object>} Database client
 */
async function getTestClient() {
  const client = await pool.connect();
  activeClients.add(client);
  return client;
}

/**
 * Release a test client
 * @param {Object} client - Database client to release
 */
function releaseTestClient(client) {
  activeClients.delete(client);
  client.release();
}

/**
 * Setup test database transaction
 * Call this in beforeEach to start a transaction
 * @returns {Promise<Object>} Database client with active transaction
 */
async function setupTestDb() {
  const client = await getTestClient();
  await client.query('BEGIN');
  return client;
}

/**
 * Cleanup test database transaction
 * Call this in afterEach to rollback transaction
 * @param {Object} client - Database client with active transaction
 */
async function cleanupTestDb(client) {
  if (client) {
    await client.query('ROLLBACK');
    releaseTestClient(client);
  }
}

/**
 * Execute a raw SQL query (use sparingly)
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(sql, params = []) {
  return pool.query(sql, params);
}

/**
 * Clear all data from a table (use with caution)
 * @param {string} tableName - Name of table to clear
 */
async function clearTable(tableName) {
  await pool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
}

/**
 * Clear all test data from database
 * Use this for integration tests that need a clean slate
 */
async function clearAllTables() {
  const tables = [
    'lot_movements',
    'order_items',
    'order_status_history',
    'deliveries',
    'payments',
    'orders',
    'lots',
    'skus',
    'products',
    'customer_addresses',
    'customers',
    'sessions',
    'users'
  ];

  for (const table of tables) {
    await clearTable(table);
  }
}

/**
 * Close all database connections
 * Call this after all tests complete
 */
async function closePool() {
  // Close all active clients
  for (const client of activeClients) {
    try {
      await client.query('ROLLBACK');
      client.release();
    } catch (err) {
      console.error('Error releasing client:', err);
    }
  }
  activeClients.clear();

  // Close the pool
  await pool.end();
}

/**
 * Check if test database exists and is accessible
 * @returns {Promise<boolean>}
 */
async function isDatabaseAccessible() {
  try {
    const result = await pool.query('SELECT NOW()');
    return !!result;
  } catch (err) {
    console.error('Database not accessible:', err.message);
    return false;
  }
}

/**
 * Run migrations on test database
 * @returns {Promise<void>}
 */
async function runMigrations() {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);

  try {
    await execPromise('npm run migrate:up', {
      cwd: require('path').join(__dirname, '../..')
    });
    console.log('✅ Test database migrations completed');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  }
}

/**
 * Insert test data and return the created record
 * @param {string} tableName - Table name
 * @param {Object} data - Data to insert
 * @returns {Promise<Object>} Inserted record
 */
async function insertTestData(tableName, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const columns = keys.join(', ');

  const sql = `
    INSERT INTO ${tableName} (${columns})
    VALUES (${placeholders})
    RETURNING *
  `;

  const result = await pool.query(sql, values);
  return result.rows[0];
}

/**
 * Verify database connection and table existence
 * @returns {Promise<void>}
 */
async function verifyTestDatabase() {
  try {
    // Check connection
    const accessible = await isDatabaseAccessible();
    if (!accessible) {
      throw new Error('Test database is not accessible');
    }

    // Check if users table exists (basic check)
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      )
    `);

    if (!result.rows[0].exists) {
      console.warn('⚠️  Tables not found. You may need to run migrations.');
    }
  } catch (err) {
    console.error('❌ Test database verification failed:', err.message);
    throw err;
  }
}

module.exports = {
  pool,
  getTestClient,
  releaseTestClient,
  setupTestDb,
  cleanupTestDb,
  query,
  clearTable,
  clearAllTables,
  closePool,
  isDatabaseAccessible,
  runMigrations,
  insertTestData,
  verifyTestDatabase
};
