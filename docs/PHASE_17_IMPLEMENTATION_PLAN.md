# Phase 17: System Integration & External Services - Implementation Plan

**Issues Covered:** #81 to #85
**Focus:** AWS S3, Google Maps, Redis Caching, Winston Logging, Error Handling

---

## Overview

Phase 17 focuses on integrating external services and improving system infrastructure:
- **AWS S3** for file storage (images, PDFs, QR codes)
- **Google Maps Distance Matrix API** for route optimization
- **Redis** for caching and session management
- **Winston** for comprehensive logging
- **Centralized error handling** with custom error classes

---

## Issue #81: AWS S3 File Storage Service

### Objective
Implement AWS S3 integration for storing and managing files (images, documents, QR codes) with compression and signed URLs.

### Database Changes
**None** - File metadata stored in existing tables (products, lots, deliveries have image_url fields)

### Backend Implementation

#### 1. AWS Configuration
**File:** `backend/config/aws.js`
```javascript
const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'nursery-uploads';
const S3_REGION = process.env.AWS_REGION || 'ap-south-1';

module.exports = { s3Client, S3_BUCKET_NAME, S3_REGION };
```

#### 2. File Storage Service
**File:** `backend/services/fileStorageService.js`
```javascript
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { s3Client, S3_BUCKET_NAME } = require('../config/aws');

class FileStorageService {
  // Upload file to S3 with compression for images
  async uploadFile(file, folder = 'uploads') {
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

    let fileBuffer = file.buffer;

    // Compress images
    if (['jpg', 'jpeg', 'png'].includes(fileExtension.toLowerCase())) {
      fileBuffer = await sharp(file.buffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

    return {
      key: fileName,
      url: `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`,
    };
  }

  // Generate signed URL for temporary access
  async getSignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }

  // Delete file from S3
  async deleteFile(key) {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  }
}

module.exports = new FileStorageService();
```

#### 3. File Upload Middleware
**File:** `backend/middleware/fileUpload.js`
```javascript
const multer = require('multer');
const AppError = require('../utils/errors').AppError;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only JPG, PNG, and PDF allowed', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

module.exports = upload;
```

#### 4. Update Upload Routes
**File:** `backend/routes/upload.js` (update)
```javascript
const express = require('express');
const router = express.Router();
const upload = require('../middleware/fileUpload');
const fileStorageService = require('../services/fileStorageService');
const { authenticate } = require('../middleware/auth');

router.post('/image', authenticate, upload.single('image'), async (req, res) => {
  try {
    const result = await fileStorageService.uploadFile(req.file, 'images');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/document', authenticate, upload.single('document'), async (req, res) => {
  try {
    const result = await fileStorageService.uploadFile(req.file, 'documents');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:key', authenticate, async (req, res) => {
  try {
    await fileStorageService.deleteFile(req.params.key);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

#### 5. Package Updates
```json
{
  "@aws-sdk/client-s3": "^3.490.0",
  "@aws-sdk/s3-request-presigner": "^3.490.0",
  "sharp": "^0.33.0",
  "multer": "^1.4.5-lts.1"
}
```

#### 6. Environment Variables
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=nursery-uploads
```

---

## Issue #82: Google Maps Distance Matrix Integration

### Objective
Integrate Google Maps Distance Matrix API for calculating distances and travel times between delivery locations.

### Backend Implementation

#### 1. Google Maps Configuration
**File:** `backend/config/googleMaps.js` (update if exists, create if not)
```javascript
const { Client } = require('@googlemaps/google-maps-services-js');

const googleMapsClient = new Client({});

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

module.exports = { googleMapsClient, GOOGLE_MAPS_API_KEY };
```

#### 2. Maps Service
**File:** `backend/services/mapsService.js`
```javascript
const { googleMapsClient, GOOGLE_MAPS_API_KEY } = require('../config/googleMaps');
const cacheService = require('./cacheService');

class MapsService {
  // Get distance matrix between multiple origins and destinations
  async getDistanceMatrix(origins, destinations) {
    // Create cache key
    const cacheKey = `distance_matrix:${JSON.stringify(origins)}:${JSON.stringify(destinations)}`;

    // Check cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const response = await googleMapsClient.distancematrix({
        params: {
          origins,
          destinations,
          mode: 'driving',
          key: GOOGLE_MAPS_API_KEY,
        },
      });

      const result = this.parseDistanceMatrixResponse(response.data);

      // Cache for 24 hours
      await cacheService.set(cacheKey, JSON.stringify(result), 86400);

      return result;
    } catch (error) {
      console.error('Google Maps API error:', error);
      throw new Error('Failed to calculate distances');
    }
  }

  // Calculate distance between two points
  async getDistance(origin, destination) {
    const matrix = await this.getDistanceMatrix([origin], [destination]);
    return matrix[0][0];
  }

  // Parse API response to simple format
  parseDistanceMatrixResponse(data) {
    return data.rows.map(row =>
      row.elements.map(element => ({
        distanceKm: element.distance ? element.distance.value / 1000 : null,
        durationMinutes: element.duration ? element.duration.value / 60 : null,
        status: element.status,
      }))
    );
  }

  // Get optimized route order using TSP approximation
  async getOptimizedRoute(stops) {
    // Get all distances between stops
    const addresses = stops.map(stop => `${stop.lat},${stop.lng}`);
    const matrix = await this.getDistanceMatrix(addresses, addresses);

    // Simple nearest neighbor algorithm
    const visited = new Set();
    const route = [0]; // Start from first stop
    visited.add(0);

    let current = 0;
    while (visited.size < stops.length) {
      let nearest = -1;
      let minDistance = Infinity;

      for (let i = 0; i < stops.length; i++) {
        if (!visited.has(i) && matrix[current][i].distanceKm < minDistance) {
          minDistance = matrix[current][i].distanceKm;
          nearest = i;
        }
      }

      route.push(nearest);
      visited.add(nearest);
      current = nearest;
    }

    return route.map(index => stops[index]);
  }
}

module.exports = new MapsService();
```

#### 3. Route Cache Utility
**File:** `backend/utils/routeCache.js`
```javascript
const cacheService = require('../services/cacheService');

class RouteCache {
  constructor() {
    this.prefix = 'route:';
    this.ttl = 86400; // 24 hours
  }

  generateKey(origins, destinations) {
    const sorted = [...origins, ...destinations].sort();
    return `${this.prefix}${sorted.join(':')}`;
  }

  async get(origins, destinations) {
    const key = this.generateKey(origins, destinations);
    const cached = await cacheService.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(origins, destinations, data) {
    const key = this.generateKey(origins, destinations);
    await cacheService.set(key, JSON.stringify(data), this.ttl);
  }
}

module.exports = new RouteCache();
```

#### 4. Package Updates
```json
{
  "@googlemaps/google-maps-services-js": "^3.3.42"
}
```

#### 5. Environment Variables
```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

---

## Issue #83: Redis Caching Layer

### Objective
Set up Redis for caching frequently accessed data, session management, and improving API performance.

### Backend Implementation

#### 1. Redis Configuration
**File:** `backend/config/redis.js` (update if exists)
```javascript
const Redis = require('ioredis');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

module.exports = redisClient;
```

#### 2. Cache Service
**File:** `backend/services/cacheService.js`
```javascript
const redisClient = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 3600; // 1 hour
  }

  // Get value from cache
  async get(key) {
    try {
      return await redisClient.get(key);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Set value in cache with TTL
  async set(key, value, ttl = this.defaultTTL) {
    try {
      if (ttl) {
        await redisClient.setex(key, ttl, value);
      } else {
        await redisClient.set(key, value);
      }
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // Delete key from cache
  async del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  // Clear all cache
  async clear() {
    try {
      await redisClient.flushdb();
      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  // Delete cache by pattern
  async delByPattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Cache pattern delete error:', error);
      return false;
    }
  }

  // Check if key exists
  async exists(key) {
    try {
      return await redisClient.exists(key) === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }
}

module.exports = new CacheService();
```

#### 3. Cache Middleware
**File:** `backend/middleware/cache.js`
```javascript
const cacheService = require('../services/cacheService');

// Cache middleware for GET requests
const cacheMiddleware = (ttl = 3600) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key from URL and query params
    const cacheKey = `api:${req.originalUrl}`;

    try {
      // Check cache
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to cache response
      res.json = (data) => {
        cacheService.set(cacheKey, JSON.stringify(data), ttl);
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

module.exports = cacheMiddleware;
```

#### 4. Update Product Controller to Use Cache
**File:** `backend/controllers/productController.js` (update)
```javascript
const cacheService = require('../services/cacheService');

// In getAllProducts function, add caching:
const getAllProducts = async (req, res) => {
  const cacheKey = `products:list:${JSON.stringify(req.query)}`;

  // Check cache
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // ... existing code to fetch products ...

  // Cache the result
  await cacheService.set(cacheKey, JSON.stringify(responseData), 3600);

  res.json(responseData);
};

// Invalidate cache on product create/update/delete
const createProduct = async (req, res) => {
  // ... existing code ...

  // Clear product list cache
  await cacheService.delByPattern('products:list:*');

  res.json(response);
};
```

#### 5. Package Updates
```json
{
  "ioredis": "^5.3.2"
}
```

#### 6. Environment Variables
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

---

## Issue #84: Winston Logging System

### Objective
Implement comprehensive logging with Winston for debugging, monitoring, and audit trails.

### Backend Implementation

#### 1. Logger Configuration
**File:** `backend/config/logger.js`
```javascript
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
  })
);

// Daily rotating file transport for all logs
const fileRotateTransport = new DailyRotateFile({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

// Daily rotating file transport for errors only
const errorFileTransport = new DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat,
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    fileRotateTransport,
    errorFileTransport,
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

module.exports = logger;
```

#### 2. Request Logger Middleware
**File:** `backend/middleware/requestLogger.js`
```javascript
const logger = require('../config/logger');

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.http(`${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id,
    };

    if (res.statusCode >= 500) {
      logger.error('Request failed', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request error', logData);
    } else {
      logger.http('Request completed', logData);
    }
  });

  next();
};

module.exports = requestLogger;
```

#### 3. Update server.js
**File:** `backend/server.js` (update)
```javascript
const logger = require('./config/logger');
const requestLogger = require('./middleware/requestLogger');

// Add request logger after body parser, before routes
app.use(requestLogger);

// Replace console.log with logger
logger.info('Server is running on port ' + PORT);
logger.info('Environment: ' + process.env.NODE_ENV);
```

#### 4. Package Updates
```json
{
  "winston": "^3.11.0",
  "winston-daily-rotate-file": "^4.7.1"
}
```

#### 5. Environment Variables
```env
LOG_LEVEL=info
NODE_ENV=development
```

---

## Issue #85: Centralized Error Handling

### Objective
Implement centralized error handling with custom error classes, consistent responses, and proper logging.

### Backend Implementation

#### 1. Custom Error Classes
**File:** `backend/utils/errors.js`
```javascript
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
};
```

#### 2. Error Handler Middleware
**File:** `backend/middleware/errorHandler.js`
```javascript
const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  let error = err;

  // Convert non-operational errors to AppError
  if (!error.isOperational) {
    error = new AppError(
      error.message || 'Internal server error',
      error.statusCode || 500,
      error.code || 'INTERNAL_ERROR'
    );
  }

  // Log error
  logger.error('Error occurred', {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
  });

  // Prepare error response
  const errorResponse = {
    error: {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    },
  };

  // Add details if available (for validation errors)
  if (error.details) {
    errorResponse.error.details = error.details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = error.stack;
  }

  res.status(error.statusCode).json(errorResponse);
};

// 404 handler for unknown routes
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

module.exports = { errorHandler, notFoundHandler };
```

#### 3. Async Error Wrapper
**File:** `backend/utils/asyncHandler.js`
```javascript
// Wrapper for async route handlers to catch errors
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;
```

#### 4. Update server.js
**File:** `backend/server.js` (update)
```javascript
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// ... all routes ...

// 404 handler (after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});
```

#### 5. Update Controllers to Use Error Classes
**Example:** `backend/controllers/productController.js`
```javascript
const { NotFoundError, ValidationError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');

const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await productService.getById(id);

  if (!product) {
    throw new NotFoundError('Product');
  }

  res.json({ success: true, data: product });
});

const createProduct = asyncHandler(async (req, res) => {
  const { name, category } = req.body;

  if (!name || !category) {
    throw new ValidationError('Name and category are required', {
      name: !name ? 'Name is required' : undefined,
      category: !category ? 'Category is required' : undefined,
    });
  }

  const product = await productService.create(req.body);

  res.status(201).json({ success: true, data: product });
});
```

#### 6. Package Updates
```json
{
  "express-async-errors": "^3.1.1"
}
```

---

## Implementation Order

### Week 1: Infrastructure Setup
1. **Day 1-2:** Issue #83 - Redis Caching
   - Install and configure Redis
   - Implement cache service
   - Create cache middleware
   - Test caching with products API

2. **Day 3-4:** Issue #84 - Winston Logging
   - Install Winston and configure logger
   - Implement request logging
   - Update all console.log to use logger
   - Test log rotation

3. **Day 5:** Issue #85 - Error Handling
   - Create custom error classes
   - Implement error handler middleware
   - Update controllers to use error classes
   - Test error responses

### Week 2: External Services
4. **Day 1-2:** Issue #81 - AWS S3
   - Set up AWS S3 bucket
   - Implement file storage service
   - Create upload middleware
   - Test image upload and compression

5. **Day 3-4:** Issue #82 - Google Maps
   - Configure Google Maps API
   - Implement maps service
   - Create route optimization logic
   - Test distance calculations

6. **Day 5:** Integration Testing
   - Test all services together
   - Performance testing
   - Documentation

---

## Testing Strategy

### Unit Tests
- Cache service get/set/delete operations
- File storage upload/delete
- Distance matrix calculations
- Error class instantiation
- Logger output format

### Integration Tests
- Upload image → S3 → Retrieve signed URL
- Calculate route distances → Cache → Retrieve from cache
- API request → Log → Error handling
- Product create → Cache invalidation

### Performance Tests
- Cache hit rate improvement
- API response time with caching
- File upload speed
- Distance matrix API rate limits

---

## Environment Variables Summary

```env
# AWS S3
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=nursery-uploads

# Google Maps
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Logging
LOG_LEVEL=info
NODE_ENV=development
```

---

## Dependencies to Install

```bash
npm install --save @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp multer
npm install --save @googlemaps/google-maps-services-js
npm install --save ioredis
npm install --save winston winston-daily-rotate-file
npm install --save express-async-errors
```

---

## File Structure

```
backend/
├── config/
│   ├── aws.js (new)
│   ├── googleMaps.js (new)
│   ├── redis.js (update)
│   └── logger.js (new)
├── services/
│   ├── fileStorageService.js (new)
│   ├── mapsService.js (new)
│   └── cacheService.js (new)
├── middleware/
│   ├── fileUpload.js (new)
│   ├── cache.js (new)
│   ├── requestLogger.js (new)
│   └── errorHandler.js (new)
├── utils/
│   ├── errors.js (new)
│   ├── asyncHandler.js (new)
│   └── routeCache.js (new)
├── routes/
│   └── upload.js (update)
├── controllers/
│   └── productController.js (update for caching)
├── logs/ (new directory)
└── server.js (update)
```

---

## Success Criteria

- ✅ Images uploaded to S3 and compressed automatically
- ✅ Signed URLs generated for secure file access
- ✅ Distance calculations cached in Redis for 24 hours
- ✅ Route optimization reduces delivery distance by 20%
- ✅ API response time improved by 50% with caching
- ✅ All requests logged with proper levels
- ✅ Errors logged with stack traces
- ✅ Consistent error response format across all endpoints
- ✅ Cache hit rate > 60% for product listings
- ✅ Log files rotate daily and retain for 14 days

---

## Risk Mitigation

1. **AWS S3 Costs:** Monitor usage, set up billing alerts
2. **Google Maps API Limits:** Implement aggressive caching, use batch requests
3. **Redis Memory:** Set max memory limit, use eviction policy
4. **Log File Growth:** Daily rotation, automatic cleanup after 14 days
5. **Error Information Leaks:** Hide stack traces in production

---

## Documentation Requirements

1. AWS S3 bucket setup guide
2. Google Maps API key creation
3. Redis installation and configuration
4. Error code reference document
5. Logging levels and when to use them
6. Cache invalidation strategy

---

This plan ensures Phase 17 integrates essential external services with proper error handling, logging, and caching infrastructure for production readiness.
