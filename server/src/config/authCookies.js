const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

// Kept roughly in sync with JWT_EXPIRES_IN's default ('7d') — the cookie
// merely needs to outlive the token; a mismatch just means the cookie could
// outlive the JWT slightly, which is harmless since the JWT itself still
// expires and gets rejected by jwt.verify.
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// SameSite=None is required once the frontend and API are on different
// domains (e.g. Vercel + Render) — cross-site cookies are blocked
// otherwise. That widens the CSRF surface, which is why csrf.middleware.js
// exists. Secure is mandatory alongside SameSite=None.
// Partitioned (CHIPS) is required on top of that: browsers are moving
// toward blocking/limiting "foreign" SameSite=None cookies outright (visible
// today as a DevTools warning, enforced in Chrome's rollout), which silently
// drops or restricts read access to the non-httpOnly csrfToken cookie —
// breaking the double-submit check. Partitioned scopes the cookie jar to
// (top-level site, cookie domain) instead of blocking it, which is exactly
// this app's shape: one frontend origin always talking to one API origin.
const baseCookieOptions = {
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  partitioned: isProd,
  path: '/',
};

function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Sets the httpOnly auth cookie plus a CSRF cookie the server compares
// against on every mutating request (see csrf.middleware.js). The CSRF
// cookie is also returned here so callers can hand it to the client in a
// JSON response body — on a cross-domain deploy, the client's own JS can
// never read a cookie set by a different origin (ordinary same-origin
// policy for document.cookie), so the response body is the only channel
// that reliably gets the value to it.
function setAuthCookies(res, token) {
  res.cookie('token', token, { ...baseCookieOptions, httpOnly: true, maxAge: COOKIE_MAX_AGE_MS });
  const csrfToken = generateCsrfToken();
  res.cookie('csrfToken', csrfToken, { ...baseCookieOptions, httpOnly: false, maxAge: COOKIE_MAX_AGE_MS });
  return csrfToken;
}

function clearAuthCookies(res) {
  res.clearCookie('token', baseCookieOptions);
  res.clearCookie('csrfToken', baseCookieOptions);
}

module.exports = { setAuthCookies, clearAuthCookies };
