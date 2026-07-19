const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

// Kept roughly in sync with JWT_EXPIRES_IN's default ('7d') — the cookie
// merely needs to outlive the token; a mismatch just means the cookie could
// outlive the JWT slightly, which is harmless since the JWT itself still
// expires and gets rejected by jwt.verify.
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// SameSite=None is required once the frontend and API are on different
// domains (e.g. Vercel + Railway) — cross-site cookies are blocked
// otherwise. That widens the CSRF surface, which is why csrf.middleware.js
// exists. Secure is mandatory alongside SameSite=None.
const baseCookieOptions = {
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
};

function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Sets the httpOnly auth cookie plus a readable CSRF cookie the client
// echoes back as a header on every request (see csrf.middleware.js).
function setAuthCookies(res, token) {
  res.cookie('token', token, { ...baseCookieOptions, httpOnly: true, maxAge: COOKIE_MAX_AGE_MS });
  res.cookie('csrfToken', generateCsrfToken(), { ...baseCookieOptions, httpOnly: false, maxAge: COOKIE_MAX_AGE_MS });
}

function clearAuthCookies(res) {
  res.clearCookie('token', baseCookieOptions);
  res.clearCookie('csrfToken', baseCookieOptions);
}

module.exports = { setAuthCookies, clearAuthCookies };
