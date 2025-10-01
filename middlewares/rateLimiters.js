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
  writeActionLimiter
};
