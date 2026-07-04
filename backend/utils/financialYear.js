/**
 * Financial-year helpers (Indian FY: April 1 – March 31).
 *
 * Mirrors the logic of the `compute_*_financial_year` DB triggers so that
 * application-computed values stay consistent with trigger-computed ones.
 */

/**
 * Compute the financial-year label (e.g. "2025-26") for a given date.
 * @param {string|Date} dateInput - ISO date string or Date
 * @returns {string}
 */
function financialYear(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1; // 1-indexed
  if (mo >= 4) {
    return `${yr}-${String((yr + 1) % 100).padStart(2, '0')}`;
  }
  return `${yr - 1}-${String(yr % 100).padStart(2, '0')}`;
}

/**
 * Generate a daily-sequenced document number, e.g. EXP-20260628-0001.
 * Counts existing rows with the same prefix (within the caller's transaction
 * client) to derive the next sequence. The unique constraint on the column is
 * the final guard against races.
 *
 * @param {object} client - pg client/pool with .query
 * @param {string} table - table name
 * @param {string} column - column holding the number
 * @param {string} prefix - e.g. "EXP" or "DEP"
 * @param {string|Date} [dateInput] - defaults to now
 * @returns {Promise<string>}
 */
async function generateDocNumber(client, table, column, prefix, dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
  const like = `${prefix}-${dateStr}-%`;
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c FROM ${table} WHERE ${column} LIKE $1`,
    [like]
  );
  const seq = String(rows[0].c + 1).padStart(4, '0');
  return `${prefix}-${dateStr}-${seq}`;
}

module.exports = { financialYear, generateDocNumber };
