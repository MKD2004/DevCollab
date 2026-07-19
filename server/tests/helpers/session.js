// Turns a supertest response from /register or /login (which set httpOnly
// `token` + readable `csrfToken` cookies, see src/config/authCookies.js)
// into a reusable "session" for subsequent requests in the same test.
function extractSession(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ');
  const csrfCookie = setCookie.find((c) => c.startsWith('csrfToken='));
  const csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : undefined;
  return { cookieHeader, csrfToken };
}

// Attaches a session's cookies + matching CSRF header to a supertest request.
function authed(req, session) {
  return req.set('Cookie', session.cookieHeader).set('X-CSRF-Token', session.csrfToken);
}

module.exports = { extractSession, authed };
