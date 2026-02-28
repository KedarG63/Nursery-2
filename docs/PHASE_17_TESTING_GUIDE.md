# Phase 17: Testing Guide

This guide provides step-by-step instructions for testing all Phase 17 features.

---

## Prerequisites

### 1. Install Redis

**Option A: Docker (Recommended)**
```bash
docker run -d -p 6379:6379 --name nursery-redis redis:latest
```

**Option B: Windows Native**
- Download from https://github.com/microsoftarchive/redis/releases
- Extract and run `redis-server.exe`

**Option C: WSL (Windows Subsystem for Linux)**
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo service redis-server start
```

**Test Redis Connection:**
```bash
# Using redis-cli
redis-cli ping
# Should respond: PONG

# Using Node.js
node -e "const Redis = require('ioredis'); const r = new Redis(); r.ping().then(console.log);"
```

### 2. Configure Environment Variables

Update `backend/.env`:

```env
# Redis (required)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Winston Logging
LOG_LEVEL=info
NODE_ENV=development

# AWS S3 (optional for local testing)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=nursery-uploads

# Google Maps (optional for local testing)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### 3. Install Dependencies

```bash
cd backend
npm install
```

---

## Test 1: Server Startup with Logging

**Purpose:** Verify Winston logging is working

```bash
cd backend
npm run dev
```

**Expected Output:**
- Colored console logs (development mode)
- `✅ Redis connected` message
- `✓ Database connection successful` message
- Server running on port 5000
- No console.log statements (all should use logger)

**Check Log Files:**
```bash
# Windows
dir logs
type logs\application-*.log

# Linux/Mac
ls -la logs/
tail -f logs/application-*.log
```

**Expected Files:**
- `application-YYYY-MM-DD.log`
- `error-YYYY-MM-DD.log`
- `exceptions.log` (created when needed)
- `rejections.log` (created when needed)

**✅ Pass Criteria:**
- Server starts without errors
- Redis connection successful
- Log files created in `logs/` directory
- Console shows colored output in development

---

## Test 2: Request Logging

**Purpose:** Verify all HTTP requests are logged

**Test Steps:**

1. Make a simple API request:
```bash
curl http://localhost:5000/api/auth/health
```

2. Check logs:
```bash
tail logs/application-*.log
```

**Expected Log Entry:**
```json
{
  "level": "http",
  "message": "GET /api/auth/health",
  "method": "GET",
  "url": "/api/auth/health",
  "ip": "::1",
  "timestamp": "2025-10-19 12:34:56"
}
```

**✅ Pass Criteria:**
- Request logged with method and URL
- Response logged with status code and duration
- User IP address captured
- Timestamp included

---

## Test 3: Error Handling

**Purpose:** Verify centralized error handling and logging

### 3a. Test 404 Handler

```bash
curl http://localhost:5000/api/nonexistent
```

**Expected Response:**
```json
{
  "error": {
    "message": "Route /api/nonexistent not found",
    "code": "ROUTE_NOT_FOUND",
    "statusCode": 404
  }
}
```

**Check Error Logs:**
```bash
tail logs/error-*.log
```

### 3b. Test Validation Error

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid"}'
```

**Expected:** Validation error with details

### 3c. Test Unauthorized Error

```bash
curl http://localhost:5000/api/products \
  -H "Authorization: Bearer invalid_token"
```

**Expected:** 401 Unauthorized error

**✅ Pass Criteria:**
- 404 errors have consistent format
- Validation errors include details
- All errors logged with stack trace
- Stack trace hidden in production mode
- Error response includes error code

---

## Test 4: Redis Caching

**Purpose:** Verify Redis caching is working

### 4a. Cache Miss (First Request)

```bash
# Login first to get token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@nursery.com", "password": "your_password"}'

# Save the token from response
export TOKEN="your_jwt_token"

# Make first request (cache miss)
time curl http://localhost:5000/api/products \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
- Response time: ~100-200ms
- Data fetched from database

### 4b. Cache Hit (Second Request)

```bash
# Make same request again (cache hit)
time curl http://localhost:5000/api/products \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:**
- Response time: ~10-30ms (much faster)
- Data fetched from Redis cache

### 4c. Verify Cache in Redis

```bash
redis-cli
> KEYS api:*
> GET "api:/api/products"
> TTL "api:/api/products"
```

**Expected:**
- Keys exist for cached requests
- TTL shows remaining seconds (3600 = 1 hour)

### 4d. Cache Invalidation

```bash
# Create a new product (should invalidate cache)
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "category": "Plants"}'

# Check if cache was cleared
redis-cli
> KEYS products:list:*
```

**Expected:**
- Cache cleared after product creation
- Next GET request will be cache miss

**✅ Pass Criteria:**
- Second request significantly faster than first
- Cache keys visible in Redis
- Cache TTL is correct (3600 seconds)
- Cache invalidated on data changes

---

## Test 5: AWS S3 File Upload

**Purpose:** Verify S3 file upload and compression

### 5a. Setup AWS S3

1. Create S3 bucket: `nursery-uploads`
2. Set CORS policy:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```
3. Update `.env` with AWS credentials

### 5b. Upload Image

```bash
# Create a test image or use existing one
curl -X POST http://localhost:5000/api/upload/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@test-image.jpg"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "key": "images/uuid-here.jpg",
    "url": "https://nursery-uploads.s3.amazonaws.com/images/uuid-here.jpg"
  }
}
```

### 5c. Verify Image Compression

**Before Upload:**
- Check original image size (e.g., 3 MB, 4000x3000px)

**After Upload:**
- Check S3 file size (should be ~300-500 KB)
- Check dimensions (should be max 1920x1080px)
- Quality should be 85%

### 5d. Get Signed URL

```bash
curl http://localhost:5000/api/upload/signed-url/images/uuid-here.jpg \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "signedUrl": "https://nursery-uploads.s3.amazonaws.com/images/uuid-here.jpg?X-Amz-Algorithm=..."
  }
}
```

**Test signed URL:**
```bash
curl "signed_url_from_above"
```

**Expected:** Image data returned

### 5e. Delete File

```bash
curl -X DELETE http://localhost:5000/api/upload/images/uuid-here.jpg \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** File deleted from S3

**✅ Pass Criteria:**
- Image uploaded to S3 successfully
- Image compressed (80-90% size reduction)
- Image resized to max 1920x1080px
- Signed URL works and expires after 1 hour
- File deletion works

---

## Test 6: Google Maps Distance Matrix

**Purpose:** Verify distance calculations and caching

### 6a. Setup Google Maps API

1. Create Google Cloud project
2. Enable Distance Matrix API
3. Create API key
4. Update `.env` with API key

### 6b. Test Distance Calculation

**Create test file:** `backend/test-maps.js`

```javascript
const mapsService = require('./services/mapsService');

async function test() {
  try {
    // Test single distance
    const distance = await mapsService.getDistance(
      '28.7041,77.1025', // Delhi
      '19.0760,72.8777'  // Mumbai
    );
    console.log('Distance:', distance);

    // Test distance matrix
    const matrix = await mapsService.getDistanceMatrix(
      ['28.7041,77.1025', '28.5355,77.3910'], // Delhi, Noida
      ['19.0760,72.8777', '12.9716,77.5946']  // Mumbai, Bangalore
    );
    console.log('Matrix:', matrix);

    // Test route optimization
    const stops = [
      { id: 1, lat: 28.7041, lng: 77.1025, name: 'Delhi' },
      { id: 2, lat: 28.5355, lng: 77.3910, name: 'Noida' },
      { id: 3, lat: 28.4595, lng: 77.0266, name: 'Gurugram' },
    ];
    const optimized = await mapsService.getOptimizedRoute(stops);
    console.log('Optimized route:', optimized.map(s => s.name));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
```

**Run test:**
```bash
node backend/test-maps.js
```

**Expected Output:**
```
Distance: { distanceKm: 1150, durationMinutes: 1100, status: 'OK' }
Matrix: [[...distance data...]]
Optimized route: ['Delhi', 'Noida', 'Gurugram']
```

### 6c. Verify Caching

```bash
# Run test again (should be much faster)
node backend/test-maps.js

# Check Redis cache
redis-cli
> KEYS distance_matrix:*
> GET "distance_matrix:*"
```

**Expected:**
- Second run is instant (cached)
- Cache keys exist in Redis
- Cache TTL is 86400 seconds (24 hours)

**✅ Pass Criteria:**
- Distance calculations return valid data
- Results include distance (km) and duration (minutes)
- Route optimization returns optimized order
- Results cached for 24 hours
- Second request uses cache (much faster)

---

## Test 7: Production Mode

**Purpose:** Verify production configuration

### 7a. Set Production Mode

Update `.env`:
```env
NODE_ENV=production
LOG_LEVEL=warn
```

### 7b. Start Server

```bash
npm start
```

**Expected:**
- No colored console output
- Only warnings and errors logged to console
- All logs written to files
- Stack traces hidden in error responses

### 7c. Test Error Response

```bash
curl http://localhost:5000/api/nonexistent
```

**Expected Response (NO stack trace):**
```json
{
  "error": {
    "message": "Route /api/nonexistent not found",
    "code": "ROUTE_NOT_FOUND",
    "statusCode": 404
  }
}
```

**✅ Pass Criteria:**
- No stack traces in error responses
- Minimal console output
- All logs in files
- Performance optimizations active

---

## Performance Benchmarks

### API Response Times (with caching)

**Without Cache:**
- Product list: ~150-250ms
- Single product: ~50-100ms
- Distance calculation: ~500-800ms

**With Cache:**
- Product list: ~10-30ms (5-10x faster)
- Single product: ~5-15ms (8-10x faster)
- Distance calculation: ~5-10ms (50-80x faster)

### Expected Improvements

- ✅ Cache hit rate: 60-80% (for product endpoints)
- ✅ API response time: 50-70% reduction (with cache)
- ✅ Database load: 40-60% reduction
- ✅ Image file size: 80-90% reduction (S3)
- ✅ Distance API calls: 90%+ reduction (cached)

---

## Common Issues and Solutions

### Issue 1: Redis Connection Failed

**Error:** `❌ Redis error: connect ECONNREFUSED`

**Solution:**
- Check if Redis is running: `redis-cli ping`
- Verify REDIS_HOST and REDIS_PORT in `.env`
- Check firewall settings

### Issue 2: AWS S3 Access Denied

**Error:** `AccessDenied: Access Denied`

**Solution:**
- Verify IAM credentials have S3 permissions
- Check bucket policy
- Verify bucket name in `.env`

### Issue 3: Google Maps API Error

**Error:** `REQUEST_DENIED`

**Solution:**
- Verify API key is correct
- Check if Distance Matrix API is enabled
- Verify billing is enabled (required)
- Check API key restrictions

### Issue 4: Logs Not Created

**Error:** No log files in `logs/` directory

**Solution:**
- Check directory permissions
- Verify Winston configuration
- Check LOG_LEVEL in `.env`

### Issue 5: Cache Not Working

**Error:** All requests are slow (no cache hits)

**Solution:**
- Verify Redis is connected
- Check if cache middleware is registered
- Verify requests are GET methods
- Check cache TTL settings

---

## Testing Checklist

- [ ] Server starts without errors
- [ ] Redis connection established
- [ ] Log files created in `logs/` directory
- [ ] HTTP requests logged with details
- [ ] 404 errors return consistent format
- [ ] Validation errors include details
- [ ] Stack traces hidden in production
- [ ] Cache speeds up repeated requests
- [ ] Cache invalidated on data changes
- [ ] Images uploaded to S3
- [ ] Images compressed automatically
- [ ] Signed URLs work and expire
- [ ] Distance calculations work
- [ ] Route optimization works
- [ ] API results cached for 24 hours
- [ ] Production mode hides stack traces
- [ ] Error logging includes context
- [ ] Request duration tracked

---

## Next Steps After Testing

1. **Monitor Performance**
   - Track cache hit rates
   - Monitor API response times
   - Check log file sizes

2. **Optimize Further**
   - Add more endpoints to cache
   - Tune cache TTL values
   - Implement cache warming

3. **Setup Production Services**
   - Redis Cloud or AWS ElastiCache
   - AWS S3 with CloudFront CDN
   - Google Maps API production key

4. **Configure Monitoring**
   - Set up log aggregation (ELK/Datadog)
   - Configure error alerts
   - Monitor API usage and costs

5. **Security Hardening**
   - Restrict S3 bucket access
   - Set API key restrictions
   - Configure Redis password
   - Enable HTTPS only

---

**Happy Testing! 🚀**
