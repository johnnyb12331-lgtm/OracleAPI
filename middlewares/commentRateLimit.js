const rateLimit = require('express-rate-limit');

// Rate limiter for comment creation
const createCommentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 comments per minute per user/IP
  message: {
    status: 'error',
    message: 'Too many comments. Please wait before posting again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise use default IP handling
    return req.user?.userId ? `user:${req.user.userId}` : undefined;
  }
});

// Rate limiter for comment retrieval
const getCommentsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute per IP
  message: {
    status: 'error',
    message: 'Too many requests. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter for comment updates/deletes
const modifyCommentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 modifications per minute per user
  message: {
    status: 'error',
    message: 'Too many modifications. Please wait before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise use default IP handling
    return req.user?.userId ? `user:${req.user.userId}` : undefined;
  }
});

module.exports = {
  createCommentLimiter,
  getCommentsLimiter,
  modifyCommentLimiter
};