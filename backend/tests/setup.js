/**
 * Jest Global Setup
 * Phase 19 - Testing Framework
 *
 * This file runs once before all test suites
 */

const path = require('path');
const dotenv = require('dotenv');

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(10000);

// Suppress console output during tests (optional)
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// Add custom matchers if needed
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false
      };
    }
  },

  toBeValidISODate(received) {
    const date = new Date(received);
    const pass = date instanceof Date && !isNaN(date);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid ISO date`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid ISO date`,
        pass: false
      };
    }
  }
});

// Global setup logging
console.log('🧪 Test environment configured');
console.log(`📊 Coverage threshold: ${process.env.COVERAGE_THRESHOLD}%`);
console.log(`🗄️  Test database: ${process.env.DB_NAME}`);
