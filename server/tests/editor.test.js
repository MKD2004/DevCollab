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
const { registerRoomAuth } = require('../src/sockets/roomAuth');
const Room = require('../src/models/Room');
const Branch = require('../src/models/Branch');

let mongod, httpServer, io, port;

function makeToken(payload = {}) {
  return jwt.sign({ id: 'user1', username: 'alice', ...payload }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

// Creates a real Room + Branch with the given member ids, so room:join
// authorization succeeds. Returns the branch id as a string.
async function makeBranch(memberIds) {
  const owner = memberIds[0];
  const room = await Room.create({ name: 'editor test room', ownerId: owner, members: memberIds });
  const branch = await Branch.create({ roomId: room._id, name: `b-${Date.now()}-${Math.random()}`, createdBy: owner });
  return branch._id.toString();
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
    registerRoomAuth(io, socket);
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
    const idA = new mongoose.Types.ObjectId().toString();
    const idB = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idA, username: 'alice' });
    const tokenB = makeToken({ id: idB, username: 'bob' });
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);
    const roomId = await makeBranch([idA, idB]);

    await new Promise((resolve) => {
      socketB.emit('room:join', roomId);
      socketA.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const received = await new Promise((resolve) => {
      socketB.on('code:change', resolve);
      socketA.emit('code:change', { roomId, content: 'hello world', language: 'javascript' });
    });

    expect(received.content).toBe('hello world');
    expect(received.language).toBe('javascript');
    socketA.disconnect();
    socketB.disconnect();
  });

  it('does not echo back to the sender', async () => {
    const idC = new mongoose.Types.ObjectId().toString();
    const token = makeToken({ id: idC, username: 'carol' });
    const socket = await connect(token);
    const roomId = await makeBranch([idC]);

    await new Promise((resolve) => {
      socket.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    let echoed = false;
    socket.on('code:change', () => { echoed = true; });
    socket.emit('code:change', { roomId, content: 'no echo', language: 'python' });

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
    const idE = new mongoose.Types.ObjectId().toString();
    const idF = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idE, username: 'eve' });
    const tokenB = makeToken({ id: idF, username: 'frank' });
    const socketA = await connect(tokenA);
    const roomId = await makeBranch([idE, idF]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    socketA.emit('code:change', { roomId, content: 'synced content', language: 'typescript' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const socketB = await connect(tokenB);
    const sync = await new Promise((resolve) => {
      socketB.on('code:sync', resolve);
      socketB.emit('room:join', roomId);
    });

    expect(sync.content).toBe('synced content');
    expect(sync.language).toBe('typescript');
    expect(sync.roomId).toBe(roomId);
    socketA.disconnect();
    socketB.disconnect();
  });

  it('sends nothing to first joiner (no prior state)', async () => {
    const idG = new mongoose.Types.ObjectId().toString();
    const token = makeToken({ id: idG, username: 'grace' });
    const socket = await connect(token);
    const roomId = await makeBranch([idG]);

    let synced = false;
    socket.on('code:sync', () => { synced = true; });
    socket.emit('room:join', roomId);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(synced).toBe(false);
    socket.disconnect();
  });
});

// ─── cursor:move / cursor:leave ───────────────────────────────────────────────

describe('cursor:move', () => {
  it('broadcasts cursor position to others in the room', async () => {
    const idH = new mongoose.Types.ObjectId().toString();
    const idI = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idH, username: 'henry' });
    const tokenB = makeToken({ id: idI, username: 'iris' });
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);
    const roomId = await makeBranch([idH, idI]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      socketB.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const received = await new Promise((resolve) => {
      socketB.on('cursor:move', resolve);
      socketA.emit('cursor:move', { roomId, position: { lineNumber: 3, column: 7 } });
    });

    expect(received.userId).toBe(idH);
    expect(received.username).toBe('henry');
    expect(received.position).toEqual({ lineNumber: 3, column: 7 });
    socketA.disconnect();
    socketB.disconnect();
  });

  it('does not echo cursor back to sender', async () => {
    const idJ = new mongoose.Types.ObjectId().toString();
    const token = makeToken({ id: idJ, username: 'jack' });
    const socket = await connect(token);
    const roomId = await makeBranch([idJ]);

    await new Promise((resolve) => {
      socket.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    let echoed = false;
    socket.on('cursor:move', () => { echoed = true; });
    socket.emit('cursor:move', { roomId, position: { lineNumber: 1, column: 1 } });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(echoed).toBe(false);
    socket.disconnect();
  });

  it('emits cursor:leave to peers when a socket disconnects', async () => {
    const idK = new mongoose.Types.ObjectId().toString();
    const idL = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idK, username: 'kate' });
    const tokenB = makeToken({ id: idL, username: 'liam' });
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);
    const roomId = await makeBranch([idK, idL]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      socketB.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const leave = await new Promise((resolve) => {
      socketB.on('cursor:leave', resolve);
      socketA.disconnect();
    });

    expect(leave.userId).toBe(idK);
    socketB.disconnect();
  });
});
