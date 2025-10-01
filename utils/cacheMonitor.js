const CommentCache = require('./commentCache');

class CacheMonitor {
  constructor() {
    this.monitoringEnabled = true;
    this.statsInterval = 5 * 60 * 1000; // 5 minutes
    this.cleanupInterval = 60 * 60 * 1000; // 1 hour
    this.performanceMetrics = {
      startTime: Date.now(),
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      peakMemoryUsage: 0,
      lastCleanup: Date.now(),
    };

    this.initializeMonitoring();
  }

  initializeMonitoring() {
    if (!this.monitoringEnabled) return;

    // Periodic stats logging
    setInterval(() => {
      this.logCacheStats();
    }, this.statsInterval);

    // Periodic cleanup
    setInterval(() => {
      this.performMaintenanceCleanup();
    }, this.cleanupInterval);

    console.log('📊 Cache monitoring initialized');
  }

  // Record cache access for performance tracking
  recordCacheAccess(hit = false, responseTime = 0) {
    this.performanceMetrics.totalRequests++;
    if (hit) {
      this.performanceMetrics.cacheHits++;
    } else {
      this.performanceMetrics.cacheMisses++;
    }

    // Update average response time
    const currentAvg = this.performanceMetrics.averageResponseTime;
    const newAvg = (currentAvg + responseTime) / 2;
    this.performanceMetrics.averageResponseTime = newAvg;
  }

  // Get comprehensive cache statistics
  getCacheStatistics() {
    const cacheStats = CommentCache.getStats();
    const cacheKeys = CommentCache.getCacheKeys();

    const totalHits = this.performanceMetrics.cacheHits;
    const totalMisses = this.performanceMetrics.cacheMisses;
    const hitRate = totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses)) * 100 : 0;

    const stats = {
      performance: {
        uptime: Date.now() - this.performanceMetrics.startTime,
        totalRequests: this.performanceMetrics.totalRequests,
        cacheHits: totalHits,
        cacheMisses: totalMisses,
        hitRate: `${hitRate.toFixed(2)}%`,
        averageResponseTime: `${this.performanceMetrics.averageResponseTime.toFixed(2)}ms`,
        requestsPerSecond: this.calculateRequestsPerSecond(),
      },
      cacheDetails: {
        userCache: {
          keys: cacheKeys.userCache?.length || 0,
          ...cacheStats.userCache,
        },
        postCache: {
          keys: cacheKeys.postCache?.length || 0,
          ...cacheStats.postCache,
        },
        avatarCache: {
          keys: cacheKeys.avatarCache?.length || 0,
          ...cacheStats.avatarCache,
        },
        profileCache: {
          keys: cacheKeys.profileCache?.length || 0,
          ...cacheStats.profileCache,
        },
        frequentPostsCache: {
          keys: cacheKeys.frequentPostsCache?.length || 0,
          ...cacheStats.frequentPostsCache,
        },
        postMetadataCache: {
          keys: cacheKeys.postMetadataCache?.length || 0,
          ...cacheStats.postMetadataCache,
        },
        countCache: {
          keys: cacheKeys.countCache?.length || 0,
          ...cacheStats.countCache,
        },
      },
      memory: {
        estimatedMemoryUsage: this.estimateMemoryUsage(),
        lastCleanup: new Date(this.performanceMetrics.lastCleanup).toISOString(),
      },
    };

    // Add recommendations using the stats object
    stats.recommendations = this.generateRecommendations(stats);

    return stats;
  }

  // Log cache statistics to console
  logCacheStats() {
    const stats = this.getCacheStatistics();
    console.log('\n📊 === CACHE STATISTICS ===');
    console.log(`Uptime: ${Math.floor(stats.performance.uptime / 1000 / 60)} minutes`);
    console.log(`Total Requests: ${stats.performance.totalRequests}`);
    console.log(`Hit Rate: ${stats.performance.hitRate}`);
    console.log(`Avg Response Time: ${stats.performance.averageResponseTime}`);
    console.log(`Requests/sec: ${stats.performance.requestsPerSecond}`);

    console.log('\nCache Details:');
    Object.entries(stats.cacheDetails).forEach(([cacheName, cacheStats]) => {
      console.log(`  ${cacheName}: ${cacheStats.keys} keys, ${cacheStats.hits || 0} hits, ${cacheStats.misses || 0} misses`);
    });

    console.log(`\nEstimated Memory Usage: ${stats.memory.estimatedMemoryUsage}`);
    console.log('========================\n');
  }

  // Perform maintenance cleanup
  performMaintenanceCleanup() {
    try {
      console.log('🧹 Performing cache maintenance cleanup...');

      // Flush expired entries
      CommentCache.flushExpired();

      // Reset performance metrics periodically (keep last 24 hours worth)
      const oneDay = 24 * 60 * 60 * 1000;
      if (Date.now() - this.performanceMetrics.startTime > oneDay) {
        this.resetPerformanceMetrics();
      }

      this.performanceMetrics.lastCleanup = Date.now();
      console.log('✅ Cache maintenance cleanup completed');
    } catch (error) {
      console.error('❌ Cache maintenance cleanup failed:', error);
    }
  }

  // Force cleanup of specific cache types
  cleanupSpecificCache(cacheType) {
    try {
      switch (cacheType) {
        case 'all':
          CommentCache.clearAll();
          this.resetPerformanceMetrics();
          console.log('🗑️ All caches cleared');
          break;
        case 'expired':
          CommentCache.flushExpired();
          console.log('🗑️ Expired cache entries cleared');
          break;
        case 'user':
          CommentCache.clearAll(); // For simplicity, clear all when targeting user cache
          console.log('🗑️ User-related caches cleared');
          break;
        default:
          console.log(`⚠️ Unknown cache type: ${cacheType}`);
      }
    } catch (error) {
      console.error(`❌ Failed to cleanup ${cacheType} cache:`, error);
    }
  }

  // Generate optimization recommendations
  generateRecommendations(stats) {
    const recommendations = [];

    const hitRate = parseFloat(stats.performance.hitRate);
    if (hitRate < 70) {
      recommendations.push('Consider increasing cache TTL values or preloading frequently accessed data');
    }

    const avgResponseTime = parseFloat(stats.performance.averageResponseTime.replace('ms', ''));
    if (avgResponseTime > 100) {
      recommendations.push('High response times detected - consider optimizing cache storage or reducing cache size');
    }

    const totalKeys = Object.values(stats.cacheDetails).reduce((sum, cache) => sum + cache.keys, 0);
    if (totalKeys > 10000) {
      recommendations.push('High number of cache keys - consider implementing LRU eviction or reducing TTL');
    }

    if (recommendations.length === 0) {
      recommendations.push('Cache performance is optimal');
    }

    return recommendations;
  }

  // Calculate requests per second
  calculateRequestsPerSecond() {
    const uptimeSeconds = (Date.now() - this.performanceMetrics.startTime) / 1000;
    return uptimeSeconds > 0 ? (this.performanceMetrics.totalRequests / uptimeSeconds).toFixed(2) : '0.00';
  }

  // Estimate memory usage (rough approximation)
  estimateMemoryUsage() {
    const cacheStats = CommentCache.getStats();
    let totalKeys = 0;
    let totalHits = 0;

    Object.values(cacheStats).forEach(cache => {
      totalKeys += cache.keys || 0;
      totalHits += cache.hits || 0;
    });

    // Rough estimate: ~1KB per cache entry
    const estimatedMB = (totalKeys * 1024) / (1024 * 1024);
    return `${estimatedMB.toFixed(2)} MB`;
  }

  // Reset performance metrics
  resetPerformanceMetrics() {
    this.performanceMetrics = {
      ...this.performanceMetrics,
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      startTime: Date.now(),
    };
  }

  // Health check
  getHealthStatus() {
    const stats = this.getCacheStatistics();
    const hitRate = parseFloat(stats.performance.hitRate);

    return {
      status: hitRate > 50 ? 'healthy' : 'warning',
      hitRate: stats.performance.hitRate,
      totalKeys: Object.values(stats.cacheDetails).reduce((sum, cache) => sum + cache.keys, 0),
      uptime: Math.floor(stats.performance.uptime / 1000 / 60), // minutes
      lastCleanup: new Date(stats.memory.lastCleanup).toISOString(),
    };
  }

  // Export metrics for external monitoring
  exportMetrics() {
    return {
      timestamp: new Date().toISOString(),
      ...this.getCacheStatistics(),
      health: this.getHealthStatus(),
    };
  }
}

// Export singleton instance
module.exports = new CacheMonitor();