// Unit tests for the cookie-attribute handling in src/config/authCookies.js.
// These drive the *production* branch directly (rather than through the app,
// which runs with NODE_ENV=test) because the bug these guard against —
// duplicate cookies from a jar split — only exists in production, where
// `partitioned` is set.
const { setAuthCookies, clearAuthCookies } = require('../src/config/authCookies');

// Minimal res stand-in: records what would be sent, in order.
function mockRes() {
  return {
    set: [],
    cleared: [],
    cookie(name, value, options) {
      this.set.push({ name, value, options });
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
    },
  };
}

function withNodeEnv(value, fn) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

describe('setAuthCookies', () => {
  it('marks cookies Secure/SameSite=None/Partitioned in production', () => {
    const res = mockRes();
    withNodeEnv('production', () => setAuthCookies(res, 'jwt-value'));

    const token = res.set.find((c) => c.name === 'token');
    const csrf = res.set.find((c) => c.name === 'csrfToken');

    for (const cookie of [token, csrf]) {
      expect(cookie.options.secure).toBe(true);
      expect(cookie.options.sameSite).toBe('none');
      expect(cookie.options.partitioned).toBe(true);
    }
    expect(token.options.httpOnly).toBe(true);
    expect(csrf.options.httpOnly).toBe(false); // client must be able to echo it
  });

  it('deletes the legacy unpartitioned cookies before setting the new ones', () => {
    const res = mockRes();
    withNodeEnv('production', () => setAuthCookies(res, 'jwt-value'));

    // Targets the pre-Partitioned jar specifically: same name/path, but
    // WITHOUT `partitioned`, so it can't clobber the cookie just set.
    for (const name of ['token', 'csrfToken']) {
      const cleared = res.cleared.find((c) => c.name === name);
      expect(cleared).toBeDefined();
      expect(cleared.options.partitioned).toBeUndefined();
      expect(cleared.options.secure).toBe(true);
      expect(cleared.options.sameSite).toBe('none');
    }
  });

  it('does not touch the legacy jar outside production', () => {
    const res = mockRes();
    withNodeEnv('development', () => setAuthCookies(res, 'jwt-value'));

    expect(res.cleared).toHaveLength(0);
    expect(res.set.every((c) => !c.options.partitioned)).toBe(true);
    expect(res.set.every((c) => c.options.sameSite === 'lax')).toBe(true);
  });

  it('returns a fresh random CSRF token matching the cookie it sets', () => {
    const first = mockRes();
    const second = mockRes();
    const a = withNodeEnv('production', () => setAuthCookies(first, 'jwt-value'));
    const b = withNodeEnv('production', () => setAuthCookies(second, 'jwt-value'));

    expect(a).toEqual(first.set.find((c) => c.name === 'csrfToken').value);
    expect(a).not.toEqual(b);
  });
});

describe('clearAuthCookies', () => {
  it('clears both the current and the legacy jar in production', () => {
    const res = mockRes();
    withNodeEnv('production', () => clearAuthCookies(res));

    // Two cookies x two jars — otherwise a stale unpartitioned cookie
    // survives logout and reintroduces the duplicate on the next request.
    expect(res.cleared.filter((c) => c.name === 'token')).toHaveLength(2);
    expect(res.cleared.filter((c) => c.name === 'csrfToken')).toHaveLength(2);
    expect(res.cleared.some((c) => c.options.partitioned === true)).toBe(true);
    expect(res.cleared.some((c) => c.options.partitioned === undefined)).toBe(true);
  });

  it('clears only the single jar outside production', () => {
    const res = mockRes();
    withNodeEnv('development', () => clearAuthCookies(res));
    expect(res.cleared).toHaveLength(2);
  });
});
