const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const app = require('../src/app');

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

// ─── POST /api/rooms ──────────────────────────────────────────────────────────

describe('POST /api/rooms', () => {
  it('creates a room and adds creator as owner and member', async () => {
    const token = await registerAndLogin('a');
    const res = await createRoom(token, 'My Room');
    expect(res.status).toBe(201);
    expect(res.body.room.name).toBe('My Room');
    expect(res.body.room.members).toHaveLength(1);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects missing room name', async () => {
    const token = await registerAndLogin('b');
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/rooms ───────────────────────────────────────────────────────────

describe('GET /api/rooms', () => {
  it('returns only rooms the user is a member of', async () => {
    const tokenA = await registerAndLogin('c');
    const tokenB = await registerAndLogin('d');

    await createRoom(tokenA, 'Room A');
    await createRoom(tokenB, 'Room B');

    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(1);
    expect(res.body.rooms[0].name).toBe('Room A');
  });

  it('returns empty array when user has no rooms', async () => {
    const token = await registerAndLogin('e');
    const res = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${token}`);
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
    const token = await registerAndLogin('f');
    const created = await createRoom(token, 'Owner Room');
    const roomId = created.body.room._id;

    const res = await request(app)
      .get(`/api/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.room.name).toBe('Owner Room');
  });

  it('auto-joins a non-member and adds them to members', async () => {
    const tokenA = await registerAndLogin('g');
    const tokenB = await registerAndLogin('h');
    const created = await createRoom(tokenA, 'Open Room');
    const roomId = created.body.room._id;

    const res = await request(app)
      .get(`/api/rooms/${roomId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);

    // User B should now appear in the rooms list
    const listRes = await request(app)
      .get('/api/rooms')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(listRes.body.rooms).toHaveLength(1);
  });

  it('returns 404 for nonexistent room', async () => {
    const token = await registerAndLogin('i');
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/rooms/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for invalid id format', async () => {
    const token = await registerAndLogin('j');
    const res = await request(app)
      .get('/api/rooms/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated request', async () => {
    const tokenA = await registerAndLogin('k');
    const created = await createRoom(tokenA, 'Some Room');
    const roomId = created.body.room._id;
    const res = await request(app).get(`/api/rooms/${roomId}`);
    expect(res.status).toBe(401);
  });
});
