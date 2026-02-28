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
