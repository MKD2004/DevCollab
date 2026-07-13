const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const { registerPresenceEvents } = require('../src/sockets/presenceEvents');
const { registerEditorEvents } = require('../src/sockets/editorEvents');

let mongod, httpServer, io, port;

function makeToken(payload = {}) {
  return jwt.sign({ id: 'user1', username: 'alice', ...payload }, process.env.JWT_SECRET, {
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
    registerPresenceEvents(io, socket);
    registerEditorEvents(io, socket);
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

// ─── code:change broadcasts ───────────────────────────────────────────────────

describe('code:change', () => {
  it('broadcasts content to other clients in the same room', async () => {
    const tokenA = makeToken({ id: 'u1', username: 'alice' });
    const tokenB = makeToken({ id: 'u2', username: 'bob' });
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);

    await new Promise((resolve) => {
      socketB.emit('room:join', 'room-1');
      socketA.emit('room:join', 'room-1');
      setTimeout(resolve, 50);
    });

    const received = await new Promise((resolve) => {
      socketB.on('code:change', resolve);
      socketA.emit('code:change', { roomId: 'room-1', content: 'hello world', language: 'javascript' });
    });

    expect(received.content).toBe('hello world');
    expect(received.language).toBe('javascript');
    socketA.disconnect();
    socketB.disconnect();
  });

  it('does not echo back to the sender', async () => {
    const token = makeToken({ id: 'u3', username: 'carol' });
    const socket = await connect(token);

    await new Promise((resolve) => {
      socket.emit('room:join', 'room-2');
      setTimeout(resolve, 50);
    });

    let echoed = false;
    socket.on('code:change', () => { echoed = true; });
    socket.emit('code:change', { roomId: 'room-2', content: 'no echo', language: 'python' });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(echoed).toBe(false);
    socket.disconnect();
  });

  it('ignores malformed payloads (missing roomId)', async () => {
    const token = makeToken({ id: 'u4', username: 'dave' });
    const socket = await connect(token);
    socket.emit('code:change', { content: 'oops' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.disconnect();
  });
});

// ─── code:sync on late join ───────────────────────────────────────────────────

describe('code:sync', () => {
  it('sends current room state to a late joiner', async () => {
    const tokenA = makeToken({ id: 'u5', username: 'eve' });
    const tokenB = makeToken({ id: 'u6', username: 'frank' });
    const socketA = await connect(tokenA);

    await new Promise((resolve) => {
      socketA.emit('room:join', 'room-3');
      setTimeout(resolve, 50);
    });

    socketA.emit('code:change', { roomId: 'room-3', content: 'synced content', language: 'typescript' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const socketB = await connect(tokenB);
    const sync = await new Promise((resolve) => {
      socketB.on('code:sync', resolve);
      socketB.emit('room:join', 'room-3');
    });

    expect(sync.content).toBe('synced content');
    expect(sync.language).toBe('typescript');
    expect(sync.roomId).toBe('room-3');
    socketA.disconnect();
    socketB.disconnect();
  });

  it('sends nothing to first joiner (no prior state)', async () => {
    const token = makeToken({ id: 'u7', username: 'grace' });
    const socket = await connect(token);

    let synced = false;
    socket.on('code:sync', () => { synced = true; });
    socket.emit('room:join', 'room-4-fresh');

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(synced).toBe(false);
    socket.disconnect();
  });
});
