const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
const { seedOTDocState } = require('../src/sockets/editorEvents');
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

async function getMainBranch(session, roomId) {
  const res = await authed(request(app).get(`/api/rooms/${roomId}/branches`), session);
  return res.body.branches.find((b) => b.isDefault);
}

// ─── POST /api/rooms/:roomId/branches ─────────────────────────────────────────

describe('POST /api/rooms/:roomId/branches', () => {
  it('creates a branch in the room', async () => {
    const session = await registerAndLogin('a');
    const created = await createRoom(session, 'Room A');
    const roomId = created.body.room._id;

    const res = await authed(request(app).post(`/api/rooms/${roomId}/branches`), session).send({
      name: 'feature-1',
    });

    expect(res.status).toBe(201);
    expect(res.body.branch.name).toBe('feature-1');
    expect(res.body.branch.isDefault).toBe(false);
  });

  it('rejects missing name', async () => {
    const session = await registerAndLogin('b');
    const created = await createRoom(session, 'Room B');
    const roomId = created.body.room._id;

    const res = await authed(request(app).post(`/api/rooms/${roomId}/branches`), session).send({});
    expect(res.status).toBe(400);
  });

  it('rejects duplicate branch names in the same room', async () => {
    const session = await registerAndLogin('c');
    const created = await createRoom(session, 'Room C');
    const roomId = created.body.room._id;

    await authed(request(app).post(`/api/rooms/${roomId}/branches`), session).send({ name: 'dup' });

    const res = await authed(request(app).post(`/api/rooms/${roomId}/branches`), session).send({ name: 'dup' });

    expect(res.status).toBe(409);
  });

  it('rejects non-members', async () => {
    const sessionA = await registerAndLogin('d');
    const sessionB = await registerAndLogin('e');
    const created = await createRoom(sessionA, 'Room D');
    const roomId = created.body.room._id;

    const res = await authed(request(app).post(`/api/rooms/${roomId}/branches`), sessionB).send({
      name: 'nope',
    });

    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated request', async () => {
    const session = await registerAndLogin('f');
    const created = await createRoom(session, 'Room F');
    const roomId = created.body.room._id;

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .send({ name: 'nope' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent room', async () => {
    const session = await registerAndLogin('g');
    const fakeId = new mongoose.Types.ObjectId();

    const res = await authed(request(app).post(`/api/rooms/${fakeId}/branches`), session).send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('forks content from fromBranchId into the new branch', async () => {
    const session = await registerAndLogin('h');
    const created = await createRoom(session, 'Room H');
    const roomId = created.body.room._id;
    const mainBranch = await getMainBranch(session, roomId);

    // Simulate the main branch having live edited content in-memory.
    seedOTDocState(mainBranch._id, 'console.log("hello")', 'javascript');

    const res = await authed(request(app).post(`/api/rooms/${roomId}/branches`), session).send({
      name: 'forked',
      fromBranchId: mainBranch._id,
    });

    expect(res.status).toBe(201);

    const { getOTDocState } = require('../src/sockets/editorEvents');
    const forkedState = getOTDocState(res.body.branch._id);
    expect(forkedState).toEqual({ content: 'console.log("hello")', language: 'javascript' });
  });

  it('rejects an invalid fromBranchId', async () => {
    const session = await registerAndLogin('i');
    const created = await createRoom(session, 'Room I');
    const roomId = created.body.room._id;

    const res = await authed(request(app).post(`/api/rooms/${roomId}/branches`), session).send({
      name: 'x',
      fromBranchId: 'not-a-valid-id',
    });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/rooms/:roomId/branches ───────────────────────────────────────────

describe('GET /api/rooms/:roomId/branches', () => {
  it('lists branches with the default branch first', async () => {
    const session = await registerAndLogin('j');
    const created = await createRoom(session, 'Room J');
    const roomId = created.body.room._id;

    await authed(request(app).post(`/api/rooms/${roomId}/branches`), session).send({ name: 'second' });

    const res = await authed(request(app).get(`/api/rooms/${roomId}/branches`), session);

    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(2);
    expect(res.body.branches[0].name).toBe('main');
    expect(res.body.branches[1].name).toBe('second');
  });

  it('rejects non-members', async () => {
    const sessionA = await registerAndLogin('k');
    const sessionB = await registerAndLogin('l');
    const created = await createRoom(sessionA, 'Room K');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}/branches`), sessionB);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated request', async () => {
    const session = await registerAndLogin('m');
    const created = await createRoom(session, 'Room M');
    const roomId = created.body.room._id;

    const res = await request(app).get(`/api/rooms/${roomId}/branches`);
    expect(res.status).toBe(401);
  });
});
