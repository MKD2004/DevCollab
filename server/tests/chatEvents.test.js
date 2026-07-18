const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const { registerChatEvents } = require('../src/sockets/chatEvents');
const Message = require('../src/models/Message');

let httpServer, io, port, mongod;

function makeToken(payload = {}) {
  // userId must be a valid ObjectId — Message.userId casts it on save.
  const id = payload.id ?? new mongoose.Types.ObjectId().toString();
  return jwt.sign({ ...payload, id, username: payload.username ?? 'alice' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      auth: { token },
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
      socket.data.user = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
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

describe('chat:message', () => {
  it('persists the message and broadcasts it to everyone in the chat room', async () => {
    const aliceId = new mongoose.Types.ObjectId().toString();
    const socketA = await connect(makeToken({ id: aliceId, username: 'alice' }));
    const socketB = await connect(makeToken({ username: 'bob' }));
    const roomId = new mongoose.Types.ObjectId().toString();

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
    const socket = await connect(makeToken({ username: 'carol' }));
    const roomId = new mongoose.Types.ObjectId().toString();

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
    const socketA = await connect(makeToken({ username: 'dave' }));
    const socketB = await connect(makeToken({ username: 'erin' }));
    const roomA = new mongoose.Types.ObjectId().toString();
    const roomB = new mongoose.Types.ObjectId().toString();

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
    const socketA = await connect(makeToken({ username: 'frank' }));
    const socketB = await connect(makeToken({ username: 'gina' }));
    const roomId = new mongoose.Types.ObjectId().toString();

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
