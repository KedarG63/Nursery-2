const logger = require('../config/logger');

class QueryBuilder {
  constructor() {
    this.query = '';
    this.params = [];
    this.paramCount = 0;
  }

  // Add SELECT clause
  select(columns = '*') {
    this.query += `SELECT ${columns} `;
    return this;
  }

  // Add FROM clause
  from(table) {
    this.query += `FROM ${table} `;
    return this;
  }

  // Add WHERE clause
  where(condition, value = null) {
    const prefix = this.query.includes('WHERE') ? 'AND' : 'WHERE';

    if (value !== null) {
      this.paramCount++;
      this.query += `${prefix} ${condition} $${this.paramCount} `;
      this.params.push(value);
    } else {
      this.query += `${prefix} ${condition} `;
    }

    return this;
  }

  // Add JOIN clause
  join(table, condition) {
    this.query += `INNER JOIN ${table} ON ${condition} `;
    return this;
  }

  leftJoin(table, condition) {
    this.query += `LEFT JOIN ${table} ON ${condition} `;
    return this;
  }

  // Add ORDER BY clause
  orderBy(column, direction = 'ASC') {
    this.query += `ORDER BY ${column} ${direction} `;
    return this;
  }

  // Add LIMIT clause
  limit(count) {
    this.paramCount++;
    this.query += `LIMIT $${this.paramCount} `;
    this.params.push(count);
    return this;
  }

  // Add OFFSET clause
  offset(count) {
    this.paramCount++;
    this.query += `OFFSET $${this.paramCount} `;
    this.params.push(count);
    return this;
  }

  // Pagination helper
  paginate(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    return this.limit(limit).offset(offset);
  }

  // Build final query
  build() {
    return {
      text: this.query.trim(),
      values: this.params,
    };
  }

  // Execute and explain query (for debugging)
  async explain(pool) {
    const explainQuery = `EXPLAIN ANALYZE ${this.query}`;
    const result = await pool.query(explainQuery, this.params);

    logger.info('Query execution plan', {
      query: this.query,
      plan: result.rows,
    });

    return result.rows;
  }

  // Execute with timing
  async execute(pool) {
    const startTime = Date.now();
    const { text, values } = this.build();

    try {
      const result = await pool.query(text, values);
      const duration = Date.now() - startTime;

      // Log slow queries (>1000ms)
      if (duration > 1000) {
        logger.warn('Slow query detected', {
          query: text,
          duration: `${duration}ms`,
          rowCount: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Query execution failed', {
        query: text,
        error: error.message,
      });
      throw error;
    }
  }
}

// Helper function to prevent N+1 queries
async function batchLoad(pool, ids, table, column = 'id') {
  if (!ids || ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const query = {
    text: `SELECT * FROM ${table} WHERE ${column} IN (${placeholders})`,
    values: ids,
  };

  const result = await pool.query(query);

  // Return as map for easy lookup
  const map = new Map();
  result.rows.forEach(row => {
    map.set(row[column], row);
  });

  return map;
}

module.exports = { QueryBuilder, batchLoad };
