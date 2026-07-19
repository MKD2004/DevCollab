const crypto = require('crypto');

// Read per-call rather than at module load: the value is only settled once
// the process is up, and reading it lazily is what makes the production
// branch reachable from tests.
const isProduction = () => process.env.NODE_ENV === 'production';

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
const baseCookieOptions = () => ({
  secure: isProduction(),
  sameSite: isProduction() ? 'none' : 'lax',
  partitioned: isProduction(),
  path: '/',
});

// Cookies set before `partitioned` was introduced live in a DIFFERENT jar
// from the partitioned ones, so setting the new cookie doesn't overwrite the
// old one — the browser keeps both and sends them together, e.g.
//   Cookie: csrfToken=<stale>; csrfToken=<current>
// The cookie parser keeps only the FIRST value, so the server ends up
// comparing against the stale token and rejecting every request as a CSRF
// failure. Worse, the duplicated `token` means a user can be authenticated
// as whoever the stale JWT belongs to. Deleting the unpartitioned variant
// (same name/path/attributes, minus `partitioned`) targets exactly the old
// jar, leaving the new cookie untouched — so any browser holding a
// pre-Partitioned session heals on its next login/register.
const LEGACY_COOKIE_OPTIONS = { secure: true, sameSite: 'none', path: '/' };

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
  const base = baseCookieOptions();

  // Must precede the res.cookie() calls below so the browser processes the
  // deletion before the fresh value — only relevant in production, since
  // that's the only environment that ever set the unpartitioned variant.
  if (isProduction()) clearLegacyAuthCookies(res);

  res.cookie('token', token, { ...base, httpOnly: true, maxAge: COOKIE_MAX_AGE_MS });
  const csrfToken = generateCsrfToken();
  res.cookie('csrfToken', csrfToken, { ...base, httpOnly: false, maxAge: COOKIE_MAX_AGE_MS });
  return csrfToken;
}

function clearLegacyAuthCookies(res) {
  res.clearCookie('token', LEGACY_COOKIE_OPTIONS);
  res.clearCookie('csrfToken', LEGACY_COOKIE_OPTIONS);
}

function clearAuthCookies(res) {
  const base = baseCookieOptions();
  // Logout has to clear both jars too, or a stale unpartitioned cookie
  // survives the logout and gets sent on the next request.
  if (isProduction()) clearLegacyAuthCookies(res);
  res.clearCookie('token', base);
  res.clearCookie('csrfToken', base);
}

module.exports = { setAuthCookies, clearAuthCookies };
