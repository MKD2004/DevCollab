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

const { registerChatEvents } = require('../src/sockets/chatEvents');
const { registerRoomAuth } = require('../src/sockets/roomAuth');
const Message = require('../src/models/Message');
const Room = require('../src/models/Room');

let httpServer, io, port, mongod;

function makeToken(payload = {}) {
  // userId must be a valid ObjectId — Message.userId casts it on save.
  const id = payload.id ?? new mongoose.Types.ObjectId().toString();
  return jwt.sign({ ...payload, id, username: payload.username ?? 'alice' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

// Creates a real Room with the given member ids, so chat:join authorization
// succeeds. Returns the room id as a string.
async function makeRoom(memberIds) {
  const room = await Room.create({ name: 'chat test room', ownerId: memberIds[0], members: memberIds });
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

describe('chat:join authorization', () => {
  it('rejects chat:join for a non-member and drops chat:message for an unjoined room', async () => {
    const memberId = new mongoose.Types.ObjectId().toString();
    const outsiderId = new mongoose.Types.ObjectId().toString();
    const roomId = await makeRoom([memberId]);

    const outsider = await connect(makeToken({ id: outsiderId, username: 'mallory' }));

    const errorPromise = new Promise((resolve) => outsider.once('chat:error', resolve));
    outsider.emit('chat:join', roomId);
    const error = await errorPromise;
    expect(error.roomId).toBe(roomId);

    let stored = null;
    outsider.emit('chat:message', { roomId, text: 'sneaky' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    stored = await Message.find({ roomId });
    expect(stored).toHaveLength(0);

    outsider.disconnect();
  });
});

describe('chat:message', () => {
  it('persists the message and broadcasts it to everyone in the chat room', async () => {
    const aliceId = new mongoose.Types.ObjectId().toString();
    const bobId = new mongoose.Types.ObjectId().toString();
    const socketA = await connect(makeToken({ id: aliceId, username: 'alice' }));
    const socketB = await connect(makeToken({ id: bobId, username: 'bob' }));
    const roomId = await makeRoom([aliceId, bobId]);

    await new Promise((resolve) => {
      socketA.emit('chat:join', roomId);
      socketB.emit('chat:join', roomId);
      setTimeout(resolve, 50);
    });

    const receivedOnB = new Promise((resolve) => socketB.once('chat:message', resolve));
    const receivedOnA = new Promise((resolve) => socketA.once('chat:message', resolve));

    socketA.emit('chat:message', { roomId, text: 'hello there' });

    const [onB, onA] = await Promise.all([receivedOnB, receivedOnA]);
    expect(onB).toMatchObject({ roomId, userId: aliceId, username: 'alice', text: 'hello there' });
    expect(onA).toMatchObject({ roomId, userId: aliceId, username: 'alice', text: 'hello there' });
    expect(onB._id).toBeDefined();
    expect(onB.createdAt).toBeDefined();

    const stored = await Message.find({ roomId });
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('hello there');

    socketA.disconnect();
    socketB.disconnect();
  });

  it('trims whitespace and ignores empty messages', async () => {
    const carolId = new mongoose.Types.ObjectId().toString();
    const socket = await connect(makeToken({ id: carolId, username: 'carol' }));
    const roomId = await makeRoom([carolId]);

    await new Promise((resolve) => {
      socket.emit('chat:join', roomId);
      setTimeout(resolve, 50);
    });

    let received = null;
    socket.on('chat:message', (msg) => { received = msg; });

    socket.emit('chat:message', { roomId, text: '   ' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toBeNull();

    socket.emit('chat:message', { roomId, text: '  padded  ' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received.text).toBe('padded');

    socket.disconnect();
  });

  it('does not broadcast to sockets in a different chat room', async () => {
    const daveId = new mongoose.Types.ObjectId().toString();
    const erinId = new mongoose.Types.ObjectId().toString();
    const socketA = await connect(makeToken({ id: daveId, username: 'dave' }));
    const socketB = await connect(makeToken({ id: erinId, username: 'erin' }));
    const roomA = await makeRoom([daveId]);
    const roomB = await makeRoom([erinId]);

    await new Promise((resolve) => {
      socketA.emit('chat:join', roomA);
      socketB.emit('chat:join', roomB);
      setTimeout(resolve, 50);
    });

    let bReceived = false;
    socketB.on('chat:message', () => { bReceived = true; });

    const receivedOnA = new Promise((resolve) => socketA.once('chat:message', resolve));
    socketA.emit('chat:message', { roomId: roomA, text: 'only for A' });
    await receivedOnA;

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bReceived).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
  });

  it('stops receiving after chat:leave', async () => {
    const frankId = new mongoose.Types.ObjectId().toString();
    const ginaId = new mongoose.Types.ObjectId().toString();
    const socketA = await connect(makeToken({ id: frankId, username: 'frank' }));
    const socketB = await connect(makeToken({ id: ginaId, username: 'gina' }));
    const roomId = await makeRoom([frankId, ginaId]);

    await new Promise((resolve) => {
      socketA.emit('chat:join', roomId);
      socketB.emit('chat:join', roomId);
      setTimeout(resolve, 50);
    });

    await new Promise((resolve) => {
      socketB.emit('chat:leave', roomId);
      setTimeout(resolve, 50);
    });

    let bReceived = false;
    socketB.on('chat:message', () => { bReceived = true; });

    const receivedOnA = new Promise((resolve) => socketA.once('chat:message', resolve));
    socketA.emit('chat:message', { roomId, text: 'after leave' });
    await receivedOnA;

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bReceived).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
  });
});
