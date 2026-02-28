const pool = require('../config/database');

/**
 * Execute a SQL query with retry logic
 * @param {string} text - SQL query
 * @param {array} params - Query parameters
 * @param {number} retries - Number of retry attempts
 * @returns {Promise} Query result
 */
async function query(text, params = [], retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const start = Date.now();
      const result = await pool.query(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === 'development') {
        console.log('Executed query', { text, duration, rows: result.rowCount });
      }

      return result;
    } catch (error) {
      lastError = error;
      console.error(`Query attempt ${attempt} failed:`, error.message);

      // Don't retry on syntax errors or constraint violations
      if (error.code === '42601' || error.code === '23505' || error.code === '23503') {
        throw error;
      }

      if (attempt < retries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise} Database client
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Test database connection
 * @returns {Promise<boolean>} Connection status
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW()');
    console.log('Database connection test successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    return false;
  }
}

/**
 * Close the database pool
 */
async function closePool() {
  await pool.end();
  console.log('Database pool closed');
}

module.exports = {
  query,
  getClient,
  testConnection,
  closePool,
  pool
};
