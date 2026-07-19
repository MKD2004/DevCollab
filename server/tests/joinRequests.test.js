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

async function requestToJoin(session, roomId) {
  return authed(request(app).post(`/api/rooms/${roomId}/join-requests`), session);
}

// ─── POST /api/rooms/:roomId/join-requests ────────────────────────────────────

describe('POST /api/rooms/:roomId/join-requests', () => {
  it('creates a pending request', async () => {
    const owner = await registerAndLogin('a');
    const bob = await registerAndLogin('b');
    const created = await createRoom(owner, 'Room A');
    const roomId = created.body.room._id;

    const res = await requestToJoin(bob, roomId);
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('pending');
  });

  it('is idempotent — re-requesting returns the same pending request instead of erroring', async () => {
    const owner = await registerAndLogin('c');
    const bob = await registerAndLogin('d');
    const created = await createRoom(owner, 'Room C');
    const roomId = created.body.room._id;

    const first = await requestToJoin(bob, roomId);
    const second = await requestToJoin(bob, roomId);

    expect(second.status).toBe(200);
    expect(second.body.request._id).toBe(first.body.request._id);
  });

  it('rejects a request from someone who is already a member', async () => {
    const owner = await registerAndLogin('e');
    const created = await createRoom(owner, 'Room E');
    const roomId = created.body.room._id;

    const res = await requestToJoin(owner, roomId);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent room', async () => {
    const bob = await registerAndLogin('f');
    const fakeId = new mongoose.Types.ObjectId();

    const res = await requestToJoin(bob, fakeId);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated request', async () => {
    const owner = await registerAndLogin('g');
    const created = await createRoom(owner, 'Room G');
    const roomId = created.body.room._id;

    const res = await request(app).post(`/api/rooms/${roomId}/join-requests`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/rooms/:roomId/join-requests ──────────────────────────────────────

describe('GET /api/rooms/:roomId/join-requests', () => {
  it('lists pending requests for the owner', async () => {
    const owner = await registerAndLogin('h');
    const bob = await registerAndLogin('i');
    const created = await createRoom(owner, 'Room H');
    const roomId = created.body.room._id;
    await requestToJoin(bob, roomId);

    const res = await authed(request(app).get(`/api/rooms/${roomId}/join-requests`), owner);
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].username).toBe('useri');
  });

  it('rejects a non-owner', async () => {
    const owner = await registerAndLogin('j');
    const bob = await registerAndLogin('k');
    const created = await createRoom(owner, 'Room J');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}/join-requests`), bob);
    expect(res.status).toBe(403);
  });
});

// ─── POST .../:requestId/accept ────────────────────────────────────────────────

describe('POST /api/rooms/:roomId/join-requests/:requestId/accept', () => {
  it('adds the requester as a member', async () => {
    const owner = await registerAndLogin('l');
    const bob = await registerAndLogin('m');
    const created = await createRoom(owner, 'Room L');
    const roomId = created.body.room._id;
    const reqRes = await requestToJoin(bob, roomId);
    const requestId = reqRes.body.request._id;

    const res = await authed(request(app).post(`/api/rooms/${roomId}/join-requests/${requestId}/accept`), owner);
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('accepted');

    const bobRoomRes = await authed(request(app).get(`/api/rooms/${roomId}`), bob);
    expect(bobRoomRes.status).toBe(200);
  });

  it('rejects a non-owner', async () => {
    const owner = await registerAndLogin('n');
    const bob = await registerAndLogin('o');
    const created = await createRoom(owner, 'Room N');
    const roomId = created.body.room._id;
    const reqRes = await requestToJoin(bob, roomId);
    const requestId = reqRes.body.request._id;

    const res = await authed(request(app).post(`/api/rooms/${roomId}/join-requests/${requestId}/accept`), bob);
    expect(res.status).toBe(403);
  });
});

// ─── POST .../:requestId/decline ───────────────────────────────────────────────

describe('POST /api/rooms/:roomId/join-requests/:requestId/decline', () => {
  it('marks the request declined and does not add membership', async () => {
    const owner = await registerAndLogin('p');
    const bob = await registerAndLogin('q');
    const created = await createRoom(owner, 'Room P');
    const roomId = created.body.room._id;
    const reqRes = await requestToJoin(bob, roomId);
    const requestId = reqRes.body.request._id;

    const res = await authed(request(app).post(`/api/rooms/${roomId}/join-requests/${requestId}/decline`), owner);
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('declined');

    const bobRoomRes = await authed(request(app).get(`/api/rooms/${roomId}`), bob);
    expect(bobRoomRes.status).toBe(403); // still not a member
  });

  it('allows a fresh request after a decline', async () => {
    const owner = await registerAndLogin('r');
    const bob = await registerAndLogin('s');
    const created = await createRoom(owner, 'Room R');
    const roomId = created.body.room._id;
    const firstReq = await requestToJoin(bob, roomId);
    await authed(
      request(app).post(`/api/rooms/${roomId}/join-requests/${firstReq.body.request._id}/decline`),
      owner
    );

    const secondReq = await requestToJoin(bob, roomId);
    expect(secondReq.status).toBe(201);
    expect(secondReq.body.request._id).not.toBe(firstReq.body.request._id);
  });
});

// ─── GET /api/rooms/:id/preview ────────────────────────────────────────────────

describe('GET /api/rooms/:id/preview', () => {
  it('returns minimal room info for a non-member', async () => {
    const owner = await registerAndLogin('t');
    const bob = await registerAndLogin('u');
    const created = await createRoom(owner, 'Preview Room');
    const roomId = created.body.room._id;

    const res = await authed(request(app).get(`/api/rooms/${roomId}/preview`), bob);
    expect(res.status).toBe(200);
    expect(res.body.room).toEqual({ _id: roomId, name: 'Preview Room' });
    expect(res.body.room.joinCode).toBeUndefined();
  });

  it('returns 404 for a nonexistent room', async () => {
    const bob = await registerAndLogin('v');
    const fakeId = new mongoose.Types.ObjectId();

    const res = await authed(request(app).get(`/api/rooms/${fakeId}/preview`), bob);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated request', async () => {
    const owner = await registerAndLogin('w');
    const created = await createRoom(owner, 'Room W');
    const roomId = created.body.room._id;

    const res = await request(app).get(`/api/rooms/${roomId}/preview`);
    expect(res.status).toBe(401);
  });
});
