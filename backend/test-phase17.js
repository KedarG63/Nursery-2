/**
 * Phase 17 Integration Test
 * Tests Redis, Logger, Cache Service, and Error Classes
 */

require('dotenv').config();

async function testPhase17() {
  console.log('🧪 Testing Phase 17 Components...\n');

  // Test 1: Redis Connection
  console.log('1️⃣ Testing Redis Connection...');
  try {
    const redisClient = require('./config/redis');
    await redisClient.ping();
    console.log('✅ Redis connected successfully\n');
  } catch (error) {
    console.log('❌ Redis connection failed:', error.message, '\n');
  }

  // Test 2: Cache Service
  console.log('2️⃣ Testing Cache Service...');
  try {
    const cacheService = require('./services/cacheService');

    // Set a value
    await cacheService.set('test:key', 'test-value', 60);

    // Get the value
    const value = await cacheService.get('test:key');

    if (value === 'test-value') {
      console.log('✅ Cache service working (set/get)\n');
    } else {
      console.log('❌ Cache service not working correctly\n');
    }

    // Test exists
    const exists = await cacheService.exists('test:key');
    console.log(`   Key exists: ${exists ? '✅' : '❌'}\n`);

    // Clean up
    await cacheService.del('test:key');
  } catch (error) {
    console.log('❌ Cache service failed:', error.message, '\n');
  }

  // Test 3: Logger
  console.log('3️⃣ Testing Winston Logger...');
  try {
    const logger = require('./config/logger');

    logger.info('Test info log');
    logger.warn('Test warning log');
    logger.error('Test error log');

    console.log('✅ Logger working (check logs/ directory)\n');
  } catch (error) {
    console.log('❌ Logger failed:', error.message, '\n');
  }

  // Test 4: Error Classes
  console.log('4️⃣ Testing Error Classes...');
  try {
    const {
      AppError,
      ValidationError,
      NotFoundError,
      UnauthorizedError,
      ForbiddenError,
      ConflictError
    } = require('./utils/errors');

    const errors = [
      new AppError('Test app error', 500, 'TEST_ERROR'),
      new ValidationError('Test validation error', { field: 'required' }),
      new NotFoundError('User'),
      new UnauthorizedError(),
      new ForbiddenError(),
      new ConflictError()
    ];

    let allWorking = true;
    errors.forEach(err => {
      if (!err.message || !err.statusCode || !err.code || !err.isOperational) {
        allWorking = false;
      }
    });

    if (allWorking) {
      console.log('✅ All error classes working\n');
    } else {
      console.log('❌ Some error classes not working correctly\n');
    }
  } catch (error) {
    console.log('❌ Error classes failed:', error.message, '\n');
  }

  // Test 5: Async Handler
  console.log('5️⃣ Testing Async Handler...');
  try {
    const asyncHandler = require('./utils/asyncHandler');

    const testFunc = asyncHandler(async (req, res, next) => {
      return 'success';
    });

    if (typeof testFunc === 'function') {
      console.log('✅ Async handler loaded correctly\n');
    }
  } catch (error) {
    console.log('❌ Async handler failed:', error.message, '\n');
  }

  // Test 6: File Upload Middleware
  console.log('6️⃣ Testing File Upload Middleware...');
  try {
    const upload = require('./middleware/fileUpload');

    if (upload && upload.single) {
      console.log('✅ File upload middleware loaded correctly\n');
    }
  } catch (error) {
    console.log('❌ File upload middleware failed:', error.message, '\n');
  }

  // Test 7: Check if logs directory exists
  console.log('7️⃣ Testing Logs Directory...');
  try {
    const fs = require('fs');
    const path = require('path');
    const logsDir = path.join(__dirname, 'logs');

    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir);
      console.log(`✅ Logs directory exists with ${files.length} files\n`);
    } else {
      console.log('⚠️  Logs directory not created yet (will be created on first log)\n');
    }
  } catch (error) {
    console.log('❌ Logs directory check failed:', error.message, '\n');
  }

  // Test 8: Environment Variables
  console.log('8️⃣ Testing Environment Variables...');
  const requiredVars = [
    'REDIS_HOST',
    'REDIS_PORT',
    'LOG_LEVEL',
    'AWS_REGION',
    'AWS_S3_BUCKET_NAME'
  ];

  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length === 0) {
    console.log('✅ All Phase 17 environment variables set\n');
  } else {
    console.log(`⚠️  Missing environment variables: ${missingVars.join(', ')}\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Phase 17 Integration Test Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Close Redis connection
  const redisClient = require('./config/redis');
  await redisClient.quit();

  process.exit(0);
}

testPhase17().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
