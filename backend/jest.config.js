/**
 * Jest Configuration
 * Phase 19 - Testing Framework Setup
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Coverage configuration
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/migrations/**',
    '!**/config/**'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/migrations/',
    '/coverage/'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  globalTeardown: '<rootDir>/tests/teardown.js',

  // Timeouts
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'json',
    'lcov'
  ],

  // Module name mapper for aliases (if any)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: false,

  // Maximum workers (parallel test execution)
  maxWorkers: '50%'
};
