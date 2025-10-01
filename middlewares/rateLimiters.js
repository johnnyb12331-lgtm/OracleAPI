const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const slowDown = require('express-slow-down');

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';

// Global API rate limiter (per IP) - more lenient in development
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 1000 : 300, // Much higher limit in development
  message: { status: 'error', message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost/development IPs
    if (isDevelopment) {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip === '10.0.2.2' || ip?.startsWith('192.168.');
    }
    return false;
  }
});

// Slow down for abusive clients (adds delay after a threshold) - disabled in development
const globalSlowDown = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: isDevelopment ? 10000 : 100, // Much higher threshold in development
  delayMs: (used, req) => {
    if (isDevelopment) return 0; // No delay in development
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500;
  },
  skip: (req) => {
    // Skip slowdown for development IPs
    if (isDevelopment) {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip === '10.0.2.2' || ip?.startsWith('192.168.');
    }
    return false;
  }
});

// Login/register specific limiter to prevent credential stuffing - more lenient in development
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 100 : 10, // Much higher limit in development
  message: { status: 'error', message: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip auth limiting for development IPs
    if (isDevelopment) {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip === '10.0.2.2' || ip?.startsWith('192.168.');
    }
    return false;
  }
});

// Separate, more lenient limiter for token refresh operations - very lenient in development
const refreshTokenLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isDevelopment ? 200 : 30, // Much higher limit in development
  message: { status: 'error', message: 'Too many token refresh attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip refresh token limiting for development IPs
    if (isDevelopment) {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip === '10.0.2.2' || ip?.startsWith('192.168.');
    }
    return false;
  },
  keyGenerator: (req) => {
    // If we can identify the user, rate limit per user instead of IP
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(refreshToken);
        if (decoded?.userId) {
          return `refresh_user:${decoded.userId}`;
        }
      } catch (e) {
        // Fall back to IP-based limiting if token decode fails
      }
    }
    return ipKeyGenerator(req);
  }
});

// Generic strict limiter for write-heavy endpoints (posts, comments, messages) - more lenient in development
const writeActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 500 : 60, // Much higher limit in development
  message: { status: 'error', message: 'Too many write actions. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip write action limiting for development IPs
    if (isDevelopment) {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip === '10.0.2.2' || ip?.startsWith('192.168.');
    }
    return false;
  },
  keyGenerator: (req) => {
    // Prefer per-user limiting when authenticated
    return req.user?.userId ? `user:${req.user.userId}` : ipKeyGenerator(req);
  }
});

module.exports = {
  globalApiLimiter,
  globalSlowDown,
  authLimiter,
  refreshTokenLimiter,
  writeActionLimiter
};
