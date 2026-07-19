const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const { registerRoomAuth } = require('../src/sockets/roomAuth');
const { registerChatEvents } = require('../src/sockets/chatEvents');
const Room = require('../src/models/Room');

let httpServer, io, port, mongod;

function makeToken({ id, username }) {
  return jwt.sign({ id, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function makeRoom(memberIds) {
  const room = await Room.create({ name: 'join notify room', ownerId: memberIds[0], members: memberIds });
  return room._id.toString();
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      extraHeaders: { Cookie: `token=${token}` },
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

/** Emits chat:join and resolves once the server has had time to process it. */
function joinChat(socket, roomId, settleMs = 80) {
  socket.emit('chat:join', roomId);
  return new Promise((resolve) => setTimeout(resolve, settleMs));
}

/** Collects every member:joined a socket receives over `ms`. */
function collectJoins(socket, ms = 250) {
  const seen = [];
  const handler = (data) => seen.push(data);
  socket.on('member:joined', handler);
  return new Promise((resolve) =>
    setTimeout(() => {
      socket.off('member:joined', handler);
      resolve(seen);
    }, ms),
  );
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.use((socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || '');
      socket.data.user = jwt.verify(cookies.token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    registerRoomAuth(io, socket);
    registerChatEvents(io, socket);
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  for (const col of Object.values(mongoose.connection.collections)) {
    await col.deleteMany({});
  }
});

describe('member:joined', () => {
  it('notifies everyone already in the room when another member connects', async () => {
    const aliceId = new mongoose.Types.ObjectId().toString();
    const bobId = new mongoose.Types.ObjectId().toString();
    const roomId = await makeRoom([aliceId, bobId]);

    const alice = await connect(makeToken({ id: aliceId, username: 'alice' }));
    await joinChat(alice, roomId);

    const notified = new Promise((resolve) => alice.once('member:joined', resolve));

    const bob = await connect(makeToken({ id: bobId, username: 'bob' }));
    await joinChat(bob, roomId);

    const event = await notified;
    expect(event).toMatchObject({ roomId, userId: bobId, username: 'bob' });
    expect(typeof event.at).toBe('string');

    alice.disconnect();
    bob.disconnect();
  });

  it('does not notify the joiner about their own arrival', async () => {
    const aliceId = new mongoose.Types.ObjectId().toString();
    const bobId = new mongoose.Types.ObjectId().toString();
    const roomId = await makeRoom([aliceId, bobId]);

    const alice = await connect(makeToken({ id: aliceId, username: 'alice' }));
    await joinChat(alice, roomId);

    const bob = await connect(makeToken({ id: bobId, username: 'bob' }));
    const selfEvents = collectJoins(bob);
    await joinChat(bob, roomId);

    expect(await selfEvents).toEqual([]);

    alice.disconnect();
    bob.disconnect();
  });

  it('stays silent when the same user opens a second tab', async () => {
    const aliceId = new mongoose.Types.ObjectId().toString();
    const bobId = new mongoose.Types.ObjectId().toString();
    const roomId = await makeRoom([aliceId, bobId]);

    const alice = await connect(makeToken({ id: aliceId, username: 'alice' }));
    await joinChat(alice, roomId);

    const bobTab1 = await connect(makeToken({ id: bobId, username: 'bob' }));
    await joinChat(bobTab1, roomId);

    // Alice has already been told about bob once; a second bob tab is the
    // same person arriving again and must not produce another notification.
    const further = collectJoins(alice);
    const bobTab2 = await connect(makeToken({ id: bobId, username: 'bob' }));
    await joinChat(bobTab2, roomId);

    expect(await further).toEqual([]);

    alice.disconnect();
    bobTab1.disconnect();
    bobTab2.disconnect();
  });

  it('does not leak a join into a different room', async () => {
    const aliceId = new mongoose.Types.ObjectId().toString();
    const bobId = new mongoose.Types.ObjectId().toString();
    const roomA = await makeRoom([aliceId]);
    const roomB = await makeRoom([aliceId, bobId]);

    const alice = await connect(makeToken({ id: aliceId, username: 'alice' }));
    await joinChat(alice, roomA);

    const outsiderEvents = collectJoins(alice);

    const bob = await connect(makeToken({ id: bobId, username: 'bob' }));
    await joinChat(bob, roomB);

    // Alice is only in roomA, so bob joining roomB must not reach her.
    expect(await outsiderEvents).toEqual([]);

    alice.disconnect();
    bob.disconnect();
  });

  it('does not announce a non-member whose chat:join was rejected', async () => {
    const aliceId = new mongoose.Types.ObjectId().toString();
    const outsiderId = new mongoose.Types.ObjectId().toString();
    const roomId = await makeRoom([aliceId]);

    const alice = await connect(makeToken({ id: aliceId, username: 'alice' }));
    await joinChat(alice, roomId);

    const events = collectJoins(alice);

    const outsider = await connect(makeToken({ id: outsiderId, username: 'mallory' }));
    await joinChat(outsider, roomId);

    expect(await events).toEqual([]);

    alice.disconnect();
    outsider.disconnect();
  });
});
