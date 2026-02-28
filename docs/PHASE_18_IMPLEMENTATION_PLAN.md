# Phase 18: Security & Performance Optimization - Implementation Plan

**Issues Covered:** #86 to #90
**Focus:** API Security Hardening & Performance Optimization
**Estimated Time:** 2-3 weeks

---

## Overview

Phase 18 focuses on hardening the application's security posture and optimizing performance through:
- **Security:** Rate limiting, input validation, CORS, and security headers
- **Performance:** Database query optimization and API response compression

This phase ensures the application is production-ready with enterprise-grade security and optimal performance.

---

## Issue #86: Rate Limiting for API Endpoints

### Objective
Implement comprehensive rate limiting to protect against abuse, brute force attacks, and DDoS attempts.

### Strategy
- Use Redis-based rate limiting for distributed systems
- Different limits for different endpoint types
- Role-based rate limiting (higher limits for admins)
- Comprehensive logging of violations

### Implementation Details

#### 1. Update Rate Limiter Configuration
**File:** `backend/config/rateLimiter.js` (new)

```javascript
const { RateLimiterRedis } = require('rate-limiter-flexible');
const redisClient = require('./redis');
const logger = require('./logger');

// Global rate limiter: 100 requests per 15 minutes per IP
const globalLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:global',
  points: 100, // Number of requests
  duration: 900, // Per 15 minutes (900 seconds)
  blockDuration: 900, // Block for 15 minutes
});

// Auth endpoints: 5 requests per 15 minutes per IP
const authLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:auth',
  points: 5,
  duration: 900,
  blockDuration: 1800, // Block for 30 minutes on auth abuse
});

// API endpoints: 60 requests per minute per user
const apiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:api',
  points: 60,
  duration: 60, // Per minute
  blockDuration: 60,
});

// Strict limiter for sensitive operations
const strictLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rlimit:strict',
  points: 10,
  duration: 3600, // Per hour
  blockDuration: 3600,
});

// Role-based point multipliers
const roleMultipliers = {
  Admin: 3, // 3x normal limit
  Manager: 2, // 2x normal limit
  Sales: 1.5,
  Warehouse: 1,
  Delivery: 1,
};

module.exports = {
  globalLimiter,
  authLimiter,
  apiLimiter,
  strictLimiter,
  roleMultipliers,
};
```

#### 2. Enhanced Rate Limiter Middleware
**File:** `backend/middleware/rateLimiter.js` (update existing)

```javascript
const { globalLimiter, authLimiter, apiLimiter, strictLimiter, roleMultipliers } = require('../config/rateLimiter');
const logger = require('../config/logger');
const { AppError } = require('../utils/errors');

// Generic rate limiter middleware
const createRateLimiter = (limiter, keyGenerator = null) => {
  return async (req, res, next) => {
    try {
      // Generate key based on IP or user
      const key = keyGenerator
        ? keyGenerator(req)
        : req.ip || req.connection.remoteAddress;

      // Calculate points based on user role
      let points = limiter.points;
      if (req.user && req.user.role) {
        const multiplier = roleMultipliers[req.user.role] || 1;
        points = Math.floor(limiter.points * multiplier);
      }

      // Consume rate limit point
      const rateLimitRes = await limiter.consume(key, 1);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', points);
      res.setHeader('X-RateLimit-Remaining', rateLimitRes.remainingPoints);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimitRes.msBeforeNext).toISOString());

      next();
    } catch (error) {
      // Rate limit exceeded
      if (error.remainingPoints !== undefined) {
        const retryAfter = Math.ceil(error.msBeforeNext / 1000);

        // Log rate limit violation
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          url: req.originalUrl,
          method: req.method,
          userId: req.user?.id,
          retryAfter,
        });

        res.setHeader('Retry-After', retryAfter);
        res.setHeader('X-RateLimit-Limit', limiter.points);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + error.msBeforeNext).toISOString());

        return next(new AppError('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED'));
      }

      // Other errors
      logger.error('Rate limiter error', { error: error.message });
      next(); // Don't block on rate limiter errors
    }
  };
};

// Global rate limiter (applied to all routes)
const globalRateLimiter = createRateLimiter(globalLimiter);

// Auth rate limiter (login, register, forgot password)
const authRateLimiter = createRateLimiter(authLimiter);

// API rate limiter (authenticated API endpoints)
const apiRateLimiter = createRateLimiter(
  apiLimiter,
  (req) => req.user?.id || req.ip
);

// Strict rate limiter (payment, sensitive operations)
const strictRateLimiter = createRateLimiter(strictLimiter);

// IP whitelist for admin operations
const adminWhitelist = (process.env.ADMIN_WHITELIST || '').split(',').filter(Boolean);

const whitelistMiddleware = (req, res, next) => {
  if (adminWhitelist.includes(req.ip)) {
    return next(); // Skip rate limiting for whitelisted IPs
  }
  next();
};

module.exports = {
  globalRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  whitelistMiddleware,
};
```

#### 3. Update server.js
**File:** `backend/server.js` (update)

```javascript
// Add after body parser, before routes
const { globalRateLimiter, whitelistMiddleware } = require('./middleware/rateLimiter');

// Apply whitelist check first
app.use(whitelistMiddleware);

// Apply global rate limiter to all routes
app.use(globalRateLimiter);
```

#### 4. Update Auth Routes
**File:** `backend/routes/auth.js` (update)

```javascript
const { authRateLimiter } = require('../middleware/rateLimiter');

// Apply strict rate limiting to auth endpoints
router.post('/login', authRateLimiter, authController.login);
router.post('/register', authRateLimiter, authController.register);
router.post('/forgot-password', authRateLimiter, authController.forgotPassword);
router.post('/reset-password', authRateLimiter, authController.resetPassword);
router.post('/refresh-token', authRateLimiter, authController.refreshToken);
```

#### 5. Update API Routes
**File:** Apply to all API routes (products, orders, etc.)

```javascript
const { apiRateLimiter } = require('../middleware/rateLimiter');

// Apply API rate limiter after authentication
router.use(authenticate);
router.use(apiRateLimiter);

// All routes now have rate limiting
```

#### 6. Package Updates
```json
{
  "rate-limiter-flexible": "^3.0.0"
}
```

#### 7. Environment Variables
```env
# Rate Limiting
ADMIN_WHITELIST=127.0.0.1,::1
RATE_LIMIT_ENABLED=true
```

---

## Issue #87: Input Validation and Sanitization

### Objective
Implement comprehensive input validation using Joi schemas and sanitization to prevent injection attacks and data corruption.

### Strategy
- Joi schemas for all endpoints
- Centralized validation middleware
- HTML sanitization for user content
- File upload validation
- Email/phone format validation

### Implementation Details

#### 1. Validation Middleware
**File:** `backend/middleware/validateRequest.js` (new)

```javascript
const Joi = require('joi');
const { ValidationError } = require('../utils/errors');
const logger = require('../config/logger');

// Middleware to validate request using Joi schema
const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
      convert: true, // Convert types
    });

    if (error) {
      const details = {};
      error.details.forEach(detail => {
        details[detail.path.join('.')] = detail.message;
      });

      logger.warn('Validation failed', {
        url: req.originalUrl,
        method: req.method,
        errors: details,
        userId: req.user?.id,
      });

      return next(new ValidationError('Validation failed', details));
    }

    // Replace request data with validated & sanitized data
    req[property] = value;
    next();
  };
};

// Common validation rules
const commonRules = {
  uuid: Joi.string().uuid(),
  email: Joi.string().email().lowercase().trim(),
  phone: Joi.string().pattern(/^[0-9]{10}$/),
  password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  name: Joi.string().min(2).max(100).trim(),
  description: Joi.string().max(5000).trim(),
  url: Joi.string().uri(),
  date: Joi.date(),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

module.exports = { validateRequest, commonRules };
```

#### 2. Sanitization Utility
**File:** `backend/utils/sanitizer.js` (new)

```javascript
const validator = require('validator');
const xss = require('xss');

class Sanitizer {
  // Sanitize HTML to prevent XSS
  sanitizeHtml(html) {
    if (!html) return '';

    return xss(html, {
      whiteList: {
        // Allow only safe HTML tags
        p: [],
        br: [],
        strong: [],
        em: [],
        u: [],
        ul: ['class'],
        ol: ['class'],
        li: [],
      },
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style'],
    });
  }

  // Sanitize plain text
  sanitizeText(text) {
    if (!text) return '';
    return validator.escape(text.toString().trim());
  }

  // Sanitize email
  sanitizeEmail(email) {
    if (!email) return '';
    return validator.normalizeEmail(email, {
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
    });
  }

  // Sanitize phone number (remove formatting)
  sanitizePhone(phone) {
    if (!phone) return '';
    return phone.toString().replace(/\D/g, '');
  }

  // Sanitize URL
  sanitizeUrl(url) {
    if (!url) return '';
    const sanitized = validator.trim(url);
    return validator.isURL(sanitized) ? sanitized : '';
  }

  // Sanitize object (recursively sanitize all string values)
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // Remove SQL injection patterns (defense in depth)
  removeSqlInjection(text) {
    if (!text) return '';

    const patterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
      /(--|;|\/\*|\*\/|xp_|sp_)/gi,
      /(\bOR\b.*=.*|'\s*OR\s*'1'\s*=\s*'1)/gi,
    ];

    let cleaned = text.toString();
    patterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned;
  }

  // Validate and sanitize file upload
  validateFile(file, options = {}) {
    const {
      maxSize = 5 * 1024 * 1024, // 5MB
      allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'],
    } = options;

    const errors = [];

    // Check file exists
    if (!file) {
      errors.push('No file provided');
      return { valid: false, errors };
    }

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    // Check MIME type
    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} not allowed`);
    }

    // Check file extension
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext)) {
      errors.push(`File extension ${ext} not allowed`);
    }

    // Check for double extensions (e.g., file.php.jpg)
    const parts = file.originalname.split('.');
    if (parts.length > 2) {
      errors.push('Multiple file extensions not allowed');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new Sanitizer();
```

#### 3. Update Product Validator
**File:** `backend/validators/productValidator.js` (update)

```javascript
const Joi = require('joi');
const { commonRules } = require('../middleware/validateRequest');

const createProductSchema = Joi.object({
  name: commonRules.name.required(),
  description: commonRules.description.allow(''),
  category: Joi.string().valid('Plants', 'Seeds', 'Pots', 'Fertilizers', 'Tools', 'Accessories').required(),
  scientific_name: Joi.string().max(200).trim().allow(''),
  image_url: commonRules.url.allow(''),
  care_instructions: commonRules.description.allow(''),
  tags: Joi.array().items(Joi.string().max(50).trim()).max(10),
  is_active: Joi.boolean().default(true),
});

const updateProductSchema = Joi.object({
  name: commonRules.name,
  description: commonRules.description.allow(''),
  category: Joi.string().valid('Plants', 'Seeds', 'Pots', 'Fertilizers', 'Tools', 'Accessories'),
  scientific_name: Joi.string().max(200).trim().allow(''),
  image_url: commonRules.url.allow(''),
  care_instructions: commonRules.description.allow(''),
  tags: Joi.array().items(Joi.string().max(50).trim()).max(10),
  is_active: Joi.boolean(),
}).min(1); // At least one field required

const getProductsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  category: Joi.string().valid('Plants', 'Seeds', 'Pots', 'Fertilizers', 'Tools', 'Accessories'),
  search: Joi.string().max(100).trim(),
  is_active: Joi.boolean(),
  sort: Joi.string().valid('name', 'category', 'created_at', '-name', '-category', '-created_at').default('-created_at'),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  getProductsSchema,
};
```

#### 4. Update Product Routes
**File:** `backend/routes/products.js` (update)

```javascript
const { validateRequest } = require('../middleware/validateRequest');
const { createProductSchema, updateProductSchema, getProductsSchema } = require('../validators/productValidator');

router.get('/', validateRequest(getProductsSchema, 'query'), productController.getAll);
router.post('/', validateRequest(createProductSchema), productController.create);
router.put('/:id', validateRequest(updateProductSchema), productController.update);
```

#### 5. Create Validators for All Entities

**Files to update:**
- `backend/validators/productValidator.js` ✅ (example above)
- `backend/validators/customerValidator.js`
- `backend/validators/orderValidator.js`
- `backend/validators/paymentValidator.js`
- `backend/validators/skuValidator.js`
- `backend/validators/lotValidator.js`
- `backend/validators/deliveryValidator.js`

#### 6. Package Updates
```json
{
  "joi": "^17.11.0",
  "validator": "^13.11.0",
  "xss": "^1.0.14"
}
```

---

## Issue #88: CORS and Security Headers

### Objective
Configure CORS policy and comprehensive security headers using Helmet.js to protect against common web vulnerabilities.

### Strategy
- Strict CORS configuration
- Helmet.js security headers
- Content Security Policy (CSP)
- HTTPS enforcement
- Secure cookie settings

### Implementation Details

#### 1. Security Configuration
**File:** `backend/config/security.js` (new)

```javascript
const helmet = require('helmet');

// Helmet security configuration
const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  // HSTS - Force HTTPS
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },

  // Prevent MIME type sniffing
  noSniff: true,

  // XSS Protection (legacy browsers)
  xssFilter: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false,
  },

  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');

    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
};

// Cookie options
const cookieOptions = {
  httpOnly: true, // Prevent XSS access
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict', // CSRF protection
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/',
};

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: cookieOptions,
  name: 'sessionId', // Don't use default 'connect.sid'
};

module.exports = {
  helmetConfig,
  corsOptions,
  cookieOptions,
  sessionConfig,
};
```

#### 2. HTTPS Redirect Middleware
**File:** `backend/middleware/httpsRedirect.js` (new)

```javascript
const logger = require('../config/logger');

// Redirect HTTP to HTTPS in production
const httpsRedirect = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    // Check if request is over HTTP
    if (req.header('x-forwarded-proto') !== 'https') {
      logger.warn('HTTP request redirected to HTTPS', {
        ip: req.ip,
        url: req.originalUrl,
      });

      return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
    }
  }
  next();
};

// Enforce secure headers
const secureHeaders = (req, res, next) => {
  // Force HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Prevent caching of sensitive data
  if (req.path.includes('/api/auth') || req.path.includes('/api/payments')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

module.exports = { httpsRedirect, secureHeaders };
```

#### 3. Update server.js
**File:** `backend/server.js` (update)

```javascript
const { helmetConfig, corsOptions } = require('./config/security');
const { httpsRedirect, secureHeaders } = require('./middleware/httpsRedirect');

// Apply security headers FIRST
app.use(helmetConfig);

// HTTPS redirect (production only)
app.use(httpsRedirect);

// Secure headers
app.use(secureHeaders);

// CORS with strict configuration
app.use(cors(corsOptions));

// Disable X-Powered-By (extra protection)
app.disable('x-powered-by');
```

#### 4. Package Updates
```json
{
  "helmet": "^7.1.0"
}
```

#### 5. Environment Variables
```env
# Security
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
SESSION_SECRET=your-super-secret-session-key-change-in-production
HTTPS_ENABLED=true
```

---

## Issue #89: Database Query Optimization

### Objective
Optimize database performance through proper indexing, query analysis, and connection pool tuning.

### Strategy
- Add indexes on frequently queried columns
- Composite indexes for multi-column queries
- Connection pool optimization
- N+1 query prevention
- Query performance monitoring

### Implementation Details

#### 1. Create Performance Indexes Migration
**File:** `backend/migrations/XXXXXX_add_performance_indexes.js` (new)

```javascript
exports.up = async (pgm) => {
  console.log('Adding performance indexes...');

  // Users table indexes
  pgm.addIndex('users', 'email', { unique: true, name: 'idx_users_email' });
  pgm.addIndex('users', 'phone', { name: 'idx_users_phone' });
  pgm.addIndex('users', 'created_at', { name: 'idx_users_created_at' });
  pgm.addIndex('users', ['deleted_at', 'is_active'], { name: 'idx_users_active' });

  // Products table indexes
  pgm.addIndex('products', 'category', { name: 'idx_products_category' });
  pgm.addIndex('products', 'is_active', { name: 'idx_products_active' });
  pgm.addIndex('products', ['category', 'is_active'], { name: 'idx_products_category_active' });
  pgm.addIndex('products', 'created_at', { name: 'idx_products_created_at' });
  // Full-text search on name and description
  pgm.sql(`
    CREATE INDEX idx_products_search ON products
    USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')))
  `);

  // SKUs table indexes
  pgm.addIndex('skus', 'product_id', { name: 'idx_skus_product_id' });
  pgm.addIndex('skus', 'sku_code', { unique: true, name: 'idx_skus_sku_code' });
  pgm.addIndex('skus', 'is_active', { name: 'idx_skus_active' });

  // Lots table indexes
  pgm.addIndex('lots', 'sku_id', { name: 'idx_lots_sku_id' });
  pgm.addIndex('lots', 'lot_number', { unique: true, name: 'idx_lots_lot_number' });
  pgm.addIndex('lots', 'status', { name: 'idx_lots_status' });
  pgm.addIndex('lots', 'location', { name: 'idx_lots_location' });
  pgm.addIndex('lots', ['sku_id', 'status'], { name: 'idx_lots_sku_status' });

  // Customers table indexes
  pgm.addIndex('customers', 'email', { unique: true, name: 'idx_customers_email' });
  pgm.addIndex('customers', 'phone', { name: 'idx_customers_phone' });
  pgm.addIndex('customers', 'customer_type', { name: 'idx_customers_type' });
  pgm.addIndex('customers', 'created_at', { name: 'idx_customers_created_at' });

  // Orders table indexes
  pgm.addIndex('orders', 'customer_id', { name: 'idx_orders_customer_id' });
  pgm.addIndex('orders', 'order_number', { unique: true, name: 'idx_orders_order_number' });
  pgm.addIndex('orders', 'status', { name: 'idx_orders_status' });
  pgm.addIndex('orders', 'order_date', { name: 'idx_orders_order_date' });
  pgm.addIndex('orders', ['customer_id', 'order_date'], { name: 'idx_orders_customer_date' });
  pgm.addIndex('orders', ['status', 'order_date'], { name: 'idx_orders_status_date' });

  // Order items table indexes
  pgm.addIndex('order_items', 'order_id', { name: 'idx_order_items_order_id' });
  pgm.addIndex('order_items', 'sku_id', { name: 'idx_order_items_sku_id' });
  pgm.addIndex('order_items', 'lot_id', { name: 'idx_order_items_lot_id' });

  // Payments table indexes
  pgm.addIndex('payments', 'order_id', { name: 'idx_payments_order_id' });
  pgm.addIndex('payments', 'customer_id', { name: 'idx_payments_customer_id' });
  pgm.addIndex('payments', 'status', { name: 'idx_payments_status' });
  pgm.addIndex('payments', 'payment_date', { name: 'idx_payments_payment_date' });
  pgm.addIndex('payments', 'payment_method', { name: 'idx_payments_method' });
  pgm.addIndex('payments', ['customer_id', 'payment_date'], { name: 'idx_payments_customer_date' });

  // Deliveries table indexes
  pgm.addIndex('delivery_routes', 'driver_id', { name: 'idx_routes_driver_id' });
  pgm.addIndex('delivery_routes', 'status', { name: 'idx_routes_status' });
  pgm.addIndex('delivery_routes', 'delivery_date', { name: 'idx_routes_delivery_date' });
  pgm.addIndex('route_stops', 'route_id', { name: 'idx_stops_route_id' });
  pgm.addIndex('route_stops', 'order_id', { name: 'idx_stops_order_id' });

  // WhatsApp messages indexes
  pgm.addIndex('whatsapp_messages', 'customer_id', { name: 'idx_whatsapp_customer_id' });
  pgm.addIndex('whatsapp_messages', 'status', { name: 'idx_whatsapp_status' });
  pgm.addIndex('whatsapp_messages', 'created_at', { name: 'idx_whatsapp_created_at' });
  pgm.addIndex('whatsapp_messages', ['customer_id', 'created_at'], { name: 'idx_whatsapp_customer_date' });

  console.log('Performance indexes added successfully');
};

exports.down = async (pgm) => {
  console.log('Removing performance indexes...');

  // Remove all indexes
  const indexes = [
    'idx_users_email', 'idx_users_phone', 'idx_users_created_at', 'idx_users_active',
    'idx_products_category', 'idx_products_active', 'idx_products_category_active',
    'idx_products_created_at', 'idx_products_search',
    'idx_skus_product_id', 'idx_skus_sku_code', 'idx_skus_active',
    'idx_lots_sku_id', 'idx_lots_lot_number', 'idx_lots_status', 'idx_lots_location', 'idx_lots_sku_status',
    'idx_customers_email', 'idx_customers_phone', 'idx_customers_type', 'idx_customers_created_at',
    'idx_orders_customer_id', 'idx_orders_order_number', 'idx_orders_status', 'idx_orders_order_date',
    'idx_orders_customer_date', 'idx_orders_status_date',
    'idx_order_items_order_id', 'idx_order_items_sku_id', 'idx_order_items_lot_id',
    'idx_payments_order_id', 'idx_payments_customer_id', 'idx_payments_status',
    'idx_payments_payment_date', 'idx_payments_method', 'idx_payments_customer_date',
    'idx_routes_driver_id', 'idx_routes_status', 'idx_routes_delivery_date',
    'idx_stops_route_id', 'idx_stops_order_id',
    'idx_whatsapp_customer_id', 'idx_whatsapp_status', 'idx_whatsapp_created_at', 'idx_whatsapp_customer_date',
  ];

  for (const index of indexes) {
    try {
      pgm.dropIndex(null, index, { ifExists: true });
    } catch (error) {
      console.log(`Could not drop index ${index}:`, error.message);
    }
  }

  console.log('Performance indexes removed');
};
```

#### 2. Update Database Configuration
**File:** `backend/config/database.js` (update if exists, or in `backend/utils/db.js`)

```javascript
const { Pool } = require('pg');

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Connection pool settings
  min: 2, // Minimum connections
  max: 20, // Maximum connections (was in Phase 1)
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 10000, // Timeout after 10s if no connection available

  // Performance settings
  statement_timeout: 30000, // Kill queries after 30 seconds
  query_timeout: 30000,

  // Keep-alive to prevent connection drops
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

const pool = new Pool(poolConfig);

// Log pool statistics
setInterval(() => {
  logger.info('Database pool stats', {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
}, 60000); // Every minute

module.exports = pool;
```

#### 3. Query Builder Utility
**File:** `backend/utils/queryBuilder.js` (new)

```javascript
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
```

#### 4. Example: Optimized Product Query
**File:** `backend/controllers/productController.js` (example update)

```javascript
const { QueryBuilder, batchLoad } = require('../utils/queryBuilder');

// Before: Multiple queries (N+1 problem)
// const getAllProducts = async (req, res) => {
//   const products = await pool.query('SELECT * FROM products');
//   for (const product of products.rows) {
//     const skus = await pool.query('SELECT * FROM skus WHERE product_id = $1', [product.id]);
//     product.skus = skus.rows;
//   }
// };

// After: Single query with JOIN
const getAllProducts = async (req, res) => {
  const { page = 1, limit = 20, category, search, is_active } = req.query;

  const qb = new QueryBuilder()
    .select('p.*, COUNT(s.id) as sku_count')
    .from('products p')
    .leftJoin('skus s', 'p.id = s.product_id')
    .where('p.deleted_at IS NULL');

  if (category) {
    qb.where('p.category =', category);
  }

  if (is_active !== undefined) {
    qb.where('p.is_active =', is_active);
  }

  if (search) {
    qb.where(`(p.name ILIKE $${qb.paramCount + 1} OR p.description ILIKE $${qb.paramCount + 1})`, `%${search}%`);
  }

  qb.query += 'GROUP BY p.id ';
  qb.orderBy('p.created_at', 'DESC')
    .paginate(page, limit);

  const result = await qb.execute(pool);

  res.json({
    success: true,
    data: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: result.rowCount,
    },
  });
};
```

---

## Issue #90: API Response Compression

### Objective
Enable response compression to reduce bandwidth usage and improve API response times for large payloads.

### Strategy
- Gzip and Brotli compression
- Intelligent compression (skip images/binaries)
- Compression threshold (1KB minimum)
- Performance monitoring

### Implementation Details

#### 1. Compression Middleware
**File:** `backend/middleware/compression.js` (new)

```javascript
const compression = require('compression');
const logger = require('../config/logger');

// Custom compression filter
const shouldCompress = (req, res) => {
  // Don't compress if client doesn't support it
  if (req.headers['x-no-compression']) {
    return false;
  }

  // Don't compress Server-Sent Events
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    return false;
  }

  // Check content type
  const contentType = res.getHeader('Content-Type');

  // Don't compress already compressed content
  const skipTypes = [
    'image/',
    'video/',
    'audio/',
    'application/zip',
    'application/gzip',
    'application/pdf',
  ];

  if (contentType) {
    for (const type of skipTypes) {
      if (contentType.includes(type)) {
        return false;
      }
    }
  }

  // Use default compression filter
  return compression.filter(req, res);
};

// Compression configuration
const compressionMiddleware = compression({
  filter: shouldCompress,
  level: 6, // Compression level (1-9, 6 is balanced)
  threshold: 1024, // Only compress responses > 1KB

  // Compression strategy callback
  strategy: (req, res) => {
    // Use Brotli for modern browsers if supported
    if (req.headers['accept-encoding']?.includes('br')) {
      return compression.Z_BROTLI;
    }
    return compression.Z_DEFAULT_COMPRESSION;
  },
});

// Middleware to track compression stats
const compressionStats = (req, res, next) => {
  const originalWrite = res.write;
  const originalEnd = res.end;

  let originalSize = 0;
  let compressedSize = 0;

  res.write = function (chunk, ...args) {
    if (chunk) {
      originalSize += chunk.length;
    }
    return originalWrite.apply(res, [chunk, ...args]);
  };

  res.end = function (chunk, ...args) {
    if (chunk) {
      originalSize += chunk.length;
    }

    const encoding = res.getHeader('Content-Encoding');
    compressedSize = parseInt(res.getHeader('Content-Length')) || originalSize;

    // Log compression stats for large responses
    if (originalSize > 10240 && encoding) { // > 10KB
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);

      logger.info('Response compressed', {
        url: req.originalUrl,
        method: req.method,
        encoding,
        originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
        compressedSize: `${(compressedSize / 1024).toFixed(2)}KB`,
        ratio: `${ratio}%`,
      });
    }

    return originalEnd.apply(res, [chunk, ...args]);
  };

  next();
};

module.exports = { compressionMiddleware, compressionStats };
```

#### 2. Update server.js
**File:** `backend/server.js` (update)

```javascript
const { compressionMiddleware, compressionStats } = require('./middleware/compression');

// Apply compression AFTER body parser, BEFORE routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Compression middleware
app.use(compressionStats); // Track stats first
app.use(compressionMiddleware); // Then compress

// Request logging middleware (Phase 17)
app.use(requestLogger);

// Routes...
```

#### 3. Package Updates
```json
{
  "compression": "^1.7.4"
}
```

---

## Implementation Order

### Week 1: Security Foundation (Issues #86, #87)

**Day 1-2: Rate Limiting (#86)**
- Install rate-limiter-flexible
- Create rate limiter configuration
- Update rate limiter middleware
- Apply to auth routes
- Test rate limiting

**Day 3-4: Input Validation (#87)**
- Install Joi, validator, xss
- Create validation middleware
- Create sanitization utility
- Update all validators with Joi schemas
- Apply validation to all routes
- Test validation and sanitization

**Day 5: Testing & Integration**
- Test rate limiting with concurrent requests
- Test validation with malicious inputs
- Test sanitization prevents XSS
- Integration testing

### Week 2: Security Hardening & Performance (Issues #88, #89, #90)

**Day 1-2: CORS & Security Headers (#88)**
- Install Helmet
- Create security configuration
- Create HTTPS redirect middleware
- Update server.js with security middleware
- Test CORS policy
- Test security headers

**Day 3-4: Database Optimization (#89)**
- Create performance indexes migration
- Run migration
- Update database configuration
- Create query builder utility
- Optimize existing queries
- Test query performance

**Day 5: Response Compression (#90)**
- Install compression library
- Create compression middleware
- Update server.js
- Test compression with various content types
- Measure compression ratios

### Week 3: Testing & Documentation

**Day 1-2: Comprehensive Testing**
- Security penetration testing
- Performance benchmarking
- Load testing
- Vulnerability scanning

**Day 3-4: Documentation**
- Update API documentation
- Security best practices guide
- Performance tuning guide
- Deployment checklist

**Day 5: Final Review & Deployment Prep**
- Code review
- Final testing
- Production configuration
- Deployment planning

---

## Testing Strategy

### Security Testing

**Rate Limiting:**
```bash
# Test auth endpoint rate limit
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Should get 429 after 5 requests
```

**Input Validation:**
```bash
# Test XSS prevention
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"<script>alert('xss')</script>"}' \
# Should be sanitized

# Test SQL injection prevention
curl http://localhost:5000/api/products?search="'; DROP TABLE products; --"
# Should be escaped
```

**CORS Testing:**
```bash
# Test CORS from unauthorized origin
curl -X GET http://localhost:5000/api/products \
  -H "Origin: https://evil.com"
# Should be rejected
```

### Performance Testing

**Database Query Performance:**
```sql
-- Analyze query plans
EXPLAIN ANALYZE SELECT * FROM orders
WHERE customer_id = 'uuid'
AND order_date > '2025-01-01'
ORDER BY order_date DESC
LIMIT 20;

-- Should use index scan, not seq scan
```

**Compression Testing:**
```bash
# Test gzip compression
curl -H "Accept-Encoding: gzip" http://localhost:5000/api/products

# Check compression headers
curl -I http://localhost:5000/api/products | grep "Content-Encoding"
```

**Load Testing:**
```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:5000/api/products

# Using Artillery
artillery quick --count 10 --num 50 http://localhost:5000/api/products
```

---

## Dependencies Summary

### New Packages

```json
{
  "rate-limiter-flexible": "^3.0.0",
  "joi": "^17.11.0",
  "validator": "^13.11.0",
  "xss": "^1.0.14",
  "helmet": "^7.1.0",
  "compression": "^1.7.4"
}
```

### Installation Command

```bash
npm install --save rate-limiter-flexible joi validator xss helmet compression
```

---

## Environment Variables

### Add to .env

```env
# Rate Limiting (Issue #86)
ADMIN_WHITELIST=127.0.0.1,::1
RATE_LIMIT_ENABLED=true

# Security (Issue #88)
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
SESSION_SECRET=your-super-secret-session-key-change-in-production
HTTPS_ENABLED=true

# Database Performance (Issue #89)
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000
DB_STATEMENT_TIMEOUT=30000

# Compression (Issue #90)
COMPRESSION_ENABLED=true
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024
```

---

## File Structure

```
backend/
├── config/
│   ├── rateLimiter.js (new)
│   └── security.js (new)
├── middleware/
│   ├── rateLimiter.js (update)
│   ├── validateRequest.js (new)
│   ├── httpsRedirect.js (new)
│   └── compression.js (new)
├── utils/
│   ├── sanitizer.js (new)
│   └── queryBuilder.js (new)
├── validators/
│   ├── productValidator.js (update with Joi)
│   ├── customerValidator.js (update with Joi)
│   ├── orderValidator.js (update with Joi)
│   ├── paymentValidator.js (update with Joi)
│   ├── skuValidator.js (update with Joi)
│   ├── lotValidator.js (update with Joi)
│   └── deliveryValidator.js (update with Joi)
├── migrations/
│   └── XXXXXX_add_performance_indexes.js (new)
└── server.js (update)
```

---

## Success Criteria

### Issue #86: Rate Limiting
- ✅ Global rate limit: 100 req/15min working
- ✅ Auth rate limit: 5 req/15min working
- ✅ API rate limit: 60 req/min working
- ✅ Rate limit headers returned
- ✅ 429 status on limit exceeded
- ✅ Redis-based distributed limiting
- ✅ Role-based limits working

### Issue #87: Input Validation
- ✅ Joi schemas for all endpoints
- ✅ Validation errors include details
- ✅ XSS prevention working
- ✅ SQL injection blocked
- ✅ File upload validation working
- ✅ Email/phone format validation
- ✅ Malicious input sanitized

### Issue #88: CORS & Security
- ✅ CORS restricted to allowed origins
- ✅ Helmet security headers enabled
- ✅ CSP configured
- ✅ HTTPS enforced in production
- ✅ Secure cookies enabled
- ✅ HSTS header present
- ✅ X-Powered-By hidden

### Issue #89: Database Optimization
- ✅ Indexes created on all FK columns
- ✅ Composite indexes for common queries
- ✅ Query plans use index scans
- ✅ Connection pool optimized
- ✅ Pagination implemented everywhere
- ✅ N+1 queries eliminated
- ✅ Slow queries logged

### Issue #90: Response Compression
- ✅ Gzip compression enabled
- ✅ Brotli supported
- ✅ Compression level 6
- ✅ 1KB threshold respected
- ✅ Images/binaries skipped
- ✅ Compression ratio logged
- ✅ Bandwidth reduced 60-80%

---

## Performance Benchmarks

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| API Response Time | 150ms | 50ms | 66% faster |
| Database Query Time | 500ms | 50ms | 90% faster |
| Bandwidth Usage | 5MB | 1.5MB | 70% reduction |
| Concurrent Requests | 50 | 200 | 4x throughput |
| Query Plan | Seq Scan | Index Scan | ✅ |
| Security Score | C | A+ | ✅ |

---

## Security Checklist

- [ ] Rate limiting prevents brute force
- [ ] Input validation prevents injection
- [ ] XSS protection enabled
- [ ] CSRF protection enabled
- [ ] SQL injection blocked
- [ ] Security headers configured
- [ ] CORS properly restricted
- [ ] HTTPS enforced
- [ ] Cookies secure & httpOnly
- [ ] Passwords hashed with bcrypt
- [ ] JWT secrets rotated
- [ ] File uploads validated
- [ ] Error messages sanitized

---

## Risk Mitigation

### Risks & Mitigations

1. **Rate limiting too strict**
   - Mitigation: Role-based multipliers, IP whitelist
   - Monitoring: Track 429 responses

2. **Validation too strict**
   - Mitigation: Clear error messages, examples in docs
   - Testing: Comprehensive test cases

3. **Database migration downtime**
   - Mitigation: Run during maintenance window
   - Rollback: Migration down() function

4. **Compression overhead**
   - Mitigation: Threshold and level tuning
   - Monitoring: Track compression ratios

5. **CORS blocks legitimate requests**
   - Mitigation: Proper origin configuration
   - Testing: Test all allowed origins

---

## Monitoring & Alerts

### Metrics to Track

1. **Rate Limiting:**
   - 429 error count
   - Top rate-limited IPs
   - Average requests per user

2. **Validation:**
   - Validation error rate
   - Common validation failures
   - Suspicious input attempts

3. **Security:**
   - CORS violations
   - XSS/injection attempts
   - Failed authentication attempts

4. **Performance:**
   - Database connection pool usage
   - Slow query count (>1s)
   - Average query time
   - Compression ratio
   - API response time p50/p95/p99

5. **Database:**
   - Index usage statistics
   - Cache hit ratio
   - Connection wait time
   - Query execution plans

---

## Deployment Checklist

### Pre-Deployment

- [ ] All migrations tested
- [ ] Environment variables configured
- [ ] Rate limiting tested
- [ ] Validation tested
- [ ] Security headers verified
- [ ] Database indexes created
- [ ] Compression tested
- [ ] Load testing passed
- [ ] Security scan passed

### Deployment

- [ ] Backup database
- [ ] Run migrations
- [ ] Deploy new code
- [ ] Verify indexes created
- [ ] Test rate limiting
- [ ] Test CORS policy
- [ ] Monitor error rates
- [ ] Monitor performance

### Post-Deployment

- [ ] Monitor 429 responses
- [ ] Monitor slow queries
- [ ] Check compression ratios
- [ ] Review security logs
- [ ] Performance benchmark
- [ ] Database index usage
- [ ] Error rate normal

---

**Phase 18 Implementation Plan Complete**

This plan ensures enterprise-grade security and optimal performance for the Nursery Management System. Each issue builds upon Phase 17's infrastructure (logging, caching, error handling) to create a production-ready application.

**Estimated Total Time:** 2-3 weeks
**Complexity:** Medium-High
**Priority:** High (Security & Performance critical for production)
