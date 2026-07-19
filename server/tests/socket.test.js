const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const app = require('../src/app');
const createSocketServer = require('../src/sockets');
const Room = require('../src/models/Room');
const Branch = require('../src/models/Branch');

let mongod, httpServer, io, port;

// Creates a real Room + default Branch with `memberId` as a member, so
// membership-gated socket events (room:join, etc.) authorize successfully.
async function createTestRoom(memberId) {
  const room = await Room.create({ name: 'test room', ownerId: memberId, members: [memberId] });
  const branch = await Branch.create({ roomId: room._id, name: 'main', createdBy: memberId, isDefault: true });
  return { room, branch };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  httpServer = http.createServer(app);
  io = createSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

function makeClient(token) {
  return ioc(`http://localhost:${port}`, {
    auth: token ? { token } : {},
    autoConnect: false,
    reconnection: false,
  });
}

function connectClient(client) {
  return new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
    client.connect();
  });
}

// ─── Socket.io auth middleware ────────────────────────────────────────────────

describe('Socket.io JWT auth middleware', () => {
  it('accepts a connection with a valid JWT', async () => {
    const token = jwt.sign(
      { id: new mongoose.Types.ObjectId(), username: 'testuser', email: 'test@test.com' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const client = makeClient(token);
    await expect(connectClient(client)).resolves.toBeUndefined();
    client.disconnect();
  });

  it('rejects a connection with an invalid token', async () => {
    const client = makeClient('this.is.invalid');
    await expect(connectClient(client)).rejects.toThrow();
    client.disconnect();
  });

  it('rejects a connection with no token', async () => {
    const client = makeClient(null);
    await expect(connectClient(client)).rejects.toThrow();
    client.disconnect();
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign(
      { id: new mongoose.Types.ObjectId(), username: 'expireduser', email: 'e@e.com' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const client = makeClient(token);
    await expect(connectClient(client)).rejects.toThrow();
    client.disconnect();
  });
});

// ─── Presence ─────────────────────────────────────────────────────────────────

describe('Socket.io presence events', () => {
  function makeAuthedClient(userId) {
    const id = userId ?? new mongoose.Types.ObjectId().toString();
    const token = jwt.sign(
      { id, username: `user_${Date.now()}`, email: `u${Date.now()}@t.com` },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    return { client: makeClient(token), userId: id };
  }

  it('broadcasts presence:update when a user joins a room', async () => {
    const { client, userId } = makeAuthedClient();
    await connectClient(client);

    const { branch } = await createTestRoom(userId);
    const roomId = branch._id.toString();

    const presencePromise = new Promise((resolve) => {
      client.once('presence:update', resolve);
    });

    client.emit('room:join', roomId);
    const data = await presencePromise;

    expect(data.roomId).toBe(roomId);
    expect(data.users).toHaveLength(1);
    client.disconnect();
  });

  it('removes user from presence on disconnect', async () => {
    const { client: clientA, userId: userIdA } = makeAuthedClient();
    const { client: clientB, userId: userIdB } = makeAuthedClient();
    await connectClient(clientA);
    await connectClient(clientB);

    const { room, branch } = await createTestRoom(userIdA);
    room.members.push(userIdB);
    await room.save();
    const roomId = branch._id.toString();

    // Both join, wait for A to see B in the room
    clientA.emit('room:join', roomId);
    await new Promise((resolve) => clientA.once('presence:update', resolve));

    clientB.emit('room:join', roomId);
    await new Promise((resolve) => clientA.once('presence:update', (d) => {
      if (d.users.length === 2) resolve();
    }));

    // B disconnects — A should see updated presence with 1 user
    const leavePromise = new Promise((resolve) => {
      clientA.on('presence:update', (d) => {
        if (d.users.length === 1) resolve(d);
      });
    });

    clientB.disconnect();
    const data = await leavePromise;
    expect(data.users).toHaveLength(1);
    clientA.disconnect();
  });
});
