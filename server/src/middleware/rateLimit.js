const rateLimit = require('express-rate-limit');

// Disabled in tests — supertest requests all share one "IP", so a real
// window would starve unrelated tests that legitimately fire many requests.
const isTest = process.env.NODE_ENV === 'test';

function makeLimiter(options) {
  if (isTest) return (req, res, next) => next();
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later' },
    ...options,
  });
}

// Login/register: brute-force protection on credentials.
const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

// Join-by-code: the code space is only 6 chars, so this needs to stay tight.
const joinCodeLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

module.exports = { authLimiter, joinCodeLimiter };
