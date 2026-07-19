const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
const Message = require('../src/models/Message');
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
  return { session: extractSession(res), userId: res.body.user.id };
}

async function createRoom(session, name = 'Test Room') {
  return authed(request(app).post('/api/rooms'), session).send({ name });
}

// ─── GET /api/rooms/:roomId/messages ───────────────────────────────────────────

describe('GET /api/rooms/:roomId/messages', () => {
  it('returns message history in chronological order', async () => {
    const { session, userId } = await registerAndLogin('a');
    const created = await createRoom(session, 'Room A');
    const roomId = created.body.room._id;

    await Message.create({ roomId, userId, username: 'usera', text: 'first' });
    await Message.create({ roomId, userId, username: 'usera', text: 'second' });

    const res = await authed(request(app).get(`/api/rooms/${roomId}/messages`), session);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].text).toBe('first');
    expect(res.body.messages[1].text).toBe('second');
  });

  it('returns an empty list for a room with no messages', async () => {
    const { session } = await registerAndLogin('b');
    const created = await createRoom(session, 'Room B');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}/messages`), session);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  it('rejects non-members', async () => {
    const a = await registerAndLogin('c');
    const b = await registerAndLogin('d');
    const created = await createRoom(a.session, 'Room C');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}/messages`), b.session);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated request', async () => {
    const { session } = await registerAndLogin('e');
    const created = await createRoom(session, 'Room E');
    const roomId = created.body.room._id;

    const res = await request(app).get(`/api/rooms/${roomId}/messages`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent room', async () => {
    const { session } = await registerAndLogin('f');
    const fakeId = new mongoose.Types.ObjectId();

    const res = await authed(request(app).get(`/api/rooms/${fakeId}/messages`), session);
    expect(res.status).toBe(404);
  });
});
