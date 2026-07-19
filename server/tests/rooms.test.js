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
  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix = '') {
  const res = await request(app).post('/api/auth/register').send({
    username: `user${suffix}`,
    email: `user${suffix}@example.com`,
    password: 'password123',
  });
  return extractSession(res);
}

async function createRoom(session, name = 'Test Room') {
  return authed(request(app).post('/api/rooms'), session).send({ name });
}

// ─── POST /api/rooms ──────────────────────────────────────────────────────────

describe('POST /api/rooms', () => {
  it('creates a room and adds creator as owner and member', async () => {
    const session = await registerAndLogin('a');
    const res = await createRoom(session, 'My Room');
    expect(res.status).toBe(201);
    expect(res.body.room.name).toBe('My Room');
    expect(res.body.room.members).toHaveLength(1);
    expect(res.body.room.joinCode).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('creates a default "main" branch for the new room', async () => {
    const session = await registerAndLogin('branch-default');
    const created = await createRoom(session, 'Branchy Room');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}/branches`), session);

    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.branches[0]).toMatchObject({ name: 'main', isDefault: true });
  });

  it('rejects missing room name', async () => {
    const session = await registerAndLogin('b');
    const res = await authed(request(app).post('/api/rooms'), session).send({});
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/rooms ───────────────────────────────────────────────────────────

describe('GET /api/rooms', () => {
  it('returns only rooms the user is a member of', async () => {
    const sessionA = await registerAndLogin('c');
    const sessionB = await registerAndLogin('d');

    await createRoom(sessionA, 'Room A');
    await createRoom(sessionB, 'Room B');

    const res = await authed(request(app).get('/api/rooms'), sessionA);

    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(1);
    expect(res.body.rooms[0].name).toBe('Room A');
  });

  it('returns empty array when user has no rooms', async () => {
    const session = await registerAndLogin('e');
    const res = await authed(request(app).get('/api/rooms'), session);
    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(0);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/rooms/:id ───────────────────────────────────────────────────────

describe('GET /api/rooms/:id', () => {
  it('returns the room to its owner', async () => {
    const session = await registerAndLogin('f');
    const created = await createRoom(session, 'Owner Room');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}`), session);
    expect(res.status).toBe(200);
    expect(res.body.room.name).toBe('Owner Room');
  });

  it('rejects a non-member with 403 and does not add them to members', async () => {
    const sessionA = await registerAndLogin('g');
    const sessionB = await registerAndLogin('h');
    const created = await createRoom(sessionA, 'Open Room');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}`), sessionB);
    expect(res.status).toBe(403);

    // User B must still have zero rooms — no membership was granted.
    const listRes = await authed(request(app).get('/api/rooms'), sessionB);
    expect(listRes.body.rooms).toHaveLength(0);
  });

  it('returns 404 for nonexistent room', async () => {
    const session = await registerAndLogin('i');
    const fakeId = new mongoose.Types.ObjectId();
    const res = await authed(request(app).get(`/api/rooms/${fakeId}`), session);
    expect(res.status).toBe(404);
  });

  it('returns 404 for invalid id format', async () => {
    const session = await registerAndLogin('j');
    const res = await authed(request(app).get('/api/rooms/not-a-valid-id'), session);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated request', async () => {
    const sessionA = await registerAndLogin('k');
    const created = await createRoom(sessionA, 'Some Room');
    const roomId = created.body.room._id;
    const res = await request(app).get(`/api/rooms/${roomId}`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/rooms/join/:code ────────────────────────────────────────────────

describe('GET /api/rooms/join/:code', () => {
  it('joins a room by its code and returns room data', async () => {
    const sessionA = await registerAndLogin('l');
    const sessionB = await registerAndLogin('m');
    const created = await createRoom(sessionA, 'Code Room');
    const { joinCode } = created.body.room;

    const res = await authed(request(app).get(`/api/rooms/join/${joinCode}`), sessionB);
    expect(res.status).toBe(200);
    expect(res.body.room.joinCode).toBe(joinCode);
  });

  it('is case-insensitive for the code', async () => {
    const sessionA = await registerAndLogin('n');
    const sessionB = await registerAndLogin('o');
    const created = await createRoom(sessionA, 'Case Room');
    const { joinCode } = created.body.room;

    const res = await authed(request(app).get(`/api/rooms/join/${joinCode.toLowerCase()}`), sessionB);
    expect(res.status).toBe(200);
  });

  it('adds the joining user as a member', async () => {
    const sessionA = await registerAndLogin('p');
    const sessionB = await registerAndLogin('q');
    const created = await createRoom(sessionA, 'Member Room');
    const { joinCode } = created.body.room;

    await authed(request(app).get(`/api/rooms/join/${joinCode}`), sessionB);

    const listRes = await authed(request(app).get('/api/rooms'), sessionB);
    expect(listRes.body.rooms).toHaveLength(1);
  });

  it('returns 404 for an invalid code', async () => {
    const session = await registerAndLogin('r');
    const res = await authed(request(app).get('/api/rooms/join/ZZZZZZ'), session);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/rooms/join/ABCDEF');
    expect(res.status).toBe(401);
  });

  it('rejects a join-by-code request missing the CSRF header even with a valid session cookie', async () => {
    const session = await registerAndLogin('s');
    const res = await request(app)
      .get('/api/rooms/join/ABCDEF')
      .set('Cookie', session.cookieHeader); // no X-CSRF-Token
    expect(res.status).toBe(403);
  });
});
