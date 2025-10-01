const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const slowDown = require('express-slow-down');

// Global API rate limiter (per IP)
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // limit each IP to 300 requests per windowMs
  message: { status: 'error', message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Slow down for abusive clients (adds delay after a threshold)
const globalSlowDown = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 100, // allow 100 requests per minute, then start adding delay
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500;
  }
});

// Login/register specific limiter to prevent credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth attempts per windowMs
  message: { status: 'error', message: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Separate, more lenient limiter for token refresh operations
const refreshTokenLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Allow 30 refresh attempts per 5 minutes per IP
  message: { status: 'error', message: 'Too many token refresh attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
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

// Generic strict limiter for write-heavy endpoints (posts, comments, messages)
const writeActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // max 60 write actions per minute per IP/user
  message: { status: 'error', message: 'Too many write actions. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
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
