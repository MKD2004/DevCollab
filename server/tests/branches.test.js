const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
const { seedOTDocState } = require('../src/sockets/editorEvents');

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
  return res.body.token;
}

async function createRoom(token, name = 'Test Room') {
  return request(app)
    .post('/api/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
}

async function getMainBranch(token, roomId) {
  const res = await request(app)
    .get(`/api/rooms/${roomId}/branches`)
    .set('Authorization', `Bearer ${token}`);
  return res.body.branches.find((b) => b.isDefault);
}

// ─── POST /api/rooms/:roomId/branches ─────────────────────────────────────────

describe('POST /api/rooms/:roomId/branches', () => {
  it('creates a branch in the room', async () => {
    const token = await registerAndLogin('a');
    const created = await createRoom(token, 'Room A');
    const roomId = created.body.room._id;

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'feature-1' });

    expect(res.status).toBe(201);
    expect(res.body.branch.name).toBe('feature-1');
    expect(res.body.branch.isDefault).toBe(false);
  });

  it('rejects missing name', async () => {
    const token = await registerAndLogin('b');
    const created = await createRoom(token, 'Room B');
    const roomId = created.body.room._id;

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects duplicate branch names in the same room', async () => {
    const token = await registerAndLogin('c');
    const created = await createRoom(token, 'Room C');
    const roomId = created.body.room._id;

    await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'dup' });

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'dup' });

    expect(res.status).toBe(409);
  });

  it('rejects non-members', async () => {
    const tokenA = await registerAndLogin('d');
    const tokenB = await registerAndLogin('e');
    const created = await createRoom(tokenA, 'Room D');
    const roomId = created.body.room._id;

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'nope' });

    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated request', async () => {
    const token = await registerAndLogin('f');
    const created = await createRoom(token, 'Room F');
    const roomId = created.body.room._id;

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .send({ name: 'nope' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent room', async () => {
    const token = await registerAndLogin('g');
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post(`/api/rooms/${fakeId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('forks content from fromBranchId into the new branch', async () => {
    const token = await registerAndLogin('h');
    const created = await createRoom(token, 'Room H');
    const roomId = created.body.room._id;
    const mainBranch = await getMainBranch(token, roomId);

    // Simulate the main branch having live edited content in-memory.
    seedOTDocState(mainBranch._id, 'console.log("hello")', 'javascript');

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'forked', fromBranchId: mainBranch._id });

    expect(res.status).toBe(201);

    const { getOTDocState } = require('../src/sockets/editorEvents');
    const forkedState = getOTDocState(res.body.branch._id);
    expect(forkedState).toEqual({ content: 'console.log("hello")', language: 'javascript' });
  });

  it('rejects an invalid fromBranchId', async () => {
    const token = await registerAndLogin('i');
    const created = await createRoom(token, 'Room I');
    const roomId = created.body.room._id;

    const res = await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x', fromBranchId: 'not-a-valid-id' });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/rooms/:roomId/branches ───────────────────────────────────────────

describe('GET /api/rooms/:roomId/branches', () => {
  it('lists branches with the default branch first', async () => {
    const token = await registerAndLogin('j');
    const created = await createRoom(token, 'Room J');
    const roomId = created.body.room._id;

    await request(app)
      .post(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'second' });

    const res = await request(app)
      .get(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(2);
    expect(res.body.branches[0].name).toBe('main');
    expect(res.body.branches[1].name).toBe('second');
  });

  it('rejects non-members', async () => {
    const tokenA = await registerAndLogin('k');
    const tokenB = await registerAndLogin('l');
    const created = await createRoom(tokenA, 'Room K');
    const roomId = created.body.room._id;

    const res = await request(app)
      .get(`/api/rooms/${roomId}/branches`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated request', async () => {
    const token = await registerAndLogin('m');
    const created = await createRoom(token, 'Room M');
    const roomId = created.body.room._id;

    const res = await request(app).get(`/api/rooms/${roomId}/branches`);
    expect(res.status).toBe(401);
  });
});
