const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
const { extractSession, authed } = require('./helpers/session');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ─── Register ────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  };

  it('registers a new user and sets an httpOnly auth cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.username).toBe(validUser.username);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.token).toBeUndefined(); // never returned in the body

    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('token=') && /HttpOnly/i.test(c))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('csrfToken=') && !/HttpOnly/i.test(c))).toBe(true);
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, username: 'differentuser' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/email/i);
  });

  it('rejects duplicate username', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'other@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/username/i);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'no@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user', email: 'u@example.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('rejects a Mongo operator object in place of email instead of using it as a query filter', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).post('/api/auth/register').send({
      username: 'attacker',
      email: { $regex: '^' }, // would match any existing user's email if used raw in a query
      password: 'password123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a Mongo operator object in place of username', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: { $ne: null },
      email: 'attacker@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(400);
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const creds = { email: 'login@example.com', password: 'validpass' };

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'loginuser', ...creds });
  });

  it('logs in with correct credentials and sets an httpOnly auth cookie', async () => {
    const res = await request(app).post('/api/auth/login').send(creds);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(creds.email);
    expect(res.body.token).toBeUndefined();

    const setCookie = res.headers['set-cookie'] || [];
    expect(setCookie.some((c) => c.startsWith('token=') && /HttpOnly/i.test(c))).toBe(true);
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  it('rejects unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('rejects a Mongo operator object in place of email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('instructs the browser to clear the auth and CSRF cookies', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      username: 'logoutuser',
      email: 'logout@example.com',
      password: 'password123',
    });
    const session = extractSession(registerRes);

    const logoutRes = await authed(request(app).post('/api/auth/logout'), session);
    expect(logoutRes.status).toBe(200);

    const setCookie = logoutRes.headers['set-cookie'] || [];
    expect(setCookie.find((c) => c.startsWith('token='))).toMatch(/token=;/);
    expect(setCookie.find((c) => c.startsWith('csrfToken='))).toMatch(/csrfToken=;/);
  });
});

// ─── CSRF ─────────────────────────────────────────────────────────────────────

describe('CSRF protection', () => {
  it('rejects a state-changing request with a missing X-CSRF-Token header', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      username: 'csrfuser1',
      email: 'csrf1@example.com',
      password: 'password123',
    });
    const session = extractSession(registerRes);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', session.cookieHeader); // cookie present, no CSRF header
    expect(res.status).toBe(403);
  });

  it('rejects a state-changing request with a mismatched X-CSRF-Token header', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      username: 'csrfuser2',
      email: 'csrf2@example.com',
      password: 'password123',
    });
    const session = extractSession(registerRes);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', 'not-the-real-token');
    expect(res.status).toBe(403);
  });

  it('accepts a state-changing request with a matching X-CSRF-Token header', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      username: 'csrfuser3',
      email: 'csrf3@example.com',
      password: 'password123',
    });
    const session = extractSession(registerRes);

    const res = await authed(request(app).post('/api/auth/logout'), session);
    expect(res.status).toBe(200);
  });

  // Regression: a browser holding a pre-Partitioned cookie alongside the
  // current one sends both, and the parser exposes only the first. Matching
  // against just that value 403'd every request from an affected browser --
  // the deployed Edge failure that prompted this.
  it('accepts the header when a stale duplicate csrfToken cookie shadows the current one', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      username: 'csrfuser4',
      email: 'csrf4@example.com',
      password: 'password123',
    });
    const session = extractSession(registerRes);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `csrfToken=stale-shadowing-value; ${session.cookieHeader}`)
      .set('X-CSRF-Token', session.csrfToken);
    expect(res.status).toBe(200);
  });

  it('still rejects a forged header when duplicate csrfToken cookies are present', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      username: 'csrfuser5',
      email: 'csrf5@example.com',
      password: 'password123',
    });
    const session = extractSession(registerRes);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `csrfToken=stale-shadowing-value; ${session.cookieHeader}`)
      .set('X-CSRF-Token', 'attacker-guess');
    expect(res.status).toBe(403);
  });
});

// ─── Protected Route ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  let session;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'meuser',
      email: 'me@example.com',
      password: 'password123',
    });
    session = extractSession(res);
  });

  it('returns user data with a valid session cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', session.cookieHeader);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects request with no cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no token/i);
  });

  it('rejects request with an invalid token cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'token=this.is.invalid');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });
});
