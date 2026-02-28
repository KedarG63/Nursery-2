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
