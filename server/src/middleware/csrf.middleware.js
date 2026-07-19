// Double-submit CSRF check: the client echoes the csrfToken value — handed
// to it via the JSON response body at login/register/me, see auth.routes.js
// — back as a header on every mutating request. A cross-site attacker can
// trigger the httpOnly auth cookie to be sent (especially with
// SameSite=None in prod) but never receives that response body, so it has
// no way to learn the value to forge the matching header. Only applied to
// state-changing methods, matching convention — except
// GET /api/rooms/join/:code, which (unusually) has a real side effect
// (auto-joins the requester as a room member).
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/register', '/api/auth/login', '/api/health']);
const PROTECTED_SAFE_ROUTE = /^\/api\/rooms\/join\/[^/]+$/;

// A browser can legitimately hold more than one cookie of the same name --
// changing a cookie's *attributes* (Partitioned, Domain, Path) creates a
// separate cookie rather than replacing the existing one, and it sends them
// all on the same request. req.cookies only exposes the first, which is not
// necessarily the current one, so read every value straight off the raw
// header and accept a match against any of them.
//
// This does not weaken the check: the client proves it can read a value the
// server issued to it, and a cross-site attacker still can't read *any* of
// them. Values aren't URL-decoded -- the tokens are hex, so decoding is a
// no-op that could only throw on a malformed cookie, and a non-match just
// fails closed.
const CSRF_COOKIE_PREFIX = 'csrfToken=';

function csrfCookieValues(req) {
  return (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(CSRF_COOKIE_PREFIX))
    .map((part) => part.slice(CSRF_COOKIE_PREFIX.length))
    .filter(Boolean);
}

function csrfProtection(req, res, next) {
  if (EXEMPT_PATHS.has(req.path)) return next();

  const needsCheck = !SAFE_METHODS.has(req.method) || PROTECTED_SAFE_ROUTE.test(req.path);
  if (!needsCheck) return next();

  // No auth cookie at all — nothing to protect; authMiddleware (applied
  // per-route) will reject the request with 401 on its own.
  if (!req.cookies?.token) return next();

  const header = req.headers['x-csrf-token'];
  if (!header || !csrfCookieValues(req).includes(header)) {
    return res.status(403).json({ message: 'Invalid or missing CSRF token' });
  }
  next();
}

module.exports = csrfProtection;
