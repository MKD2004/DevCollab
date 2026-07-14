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
const TextOperation = require('../src/ot/TextOperation');

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

describe('per-branch OT isolation', () => {
  it('keeps edits on one branch from ever reaching another branch', async () => {
    const tokenA = makeToken({ id: 'u1', username: 'alice' });
    const tokenB = makeToken({ id: 'u2', username: 'bob' });
    const socketA = await connect(tokenA); // viewing branch-1
    const socketB = await connect(tokenB); // viewing branch-2

    await new Promise((resolve) => {
      socketA.emit('room:join', 'branch-1');
      socketB.emit('room:join', 'branch-2');
      setTimeout(resolve, 50);
    });

    let crossTalk = false;
    socketB.on('code:op', () => { crossTalk = true; });

    const ack = new Promise((resolve) => socketA.once('code:ack', resolve));
    socketA.emit('code:op', {
      roomId: 'branch-1',
      revision: 0,
      operation: new TextOperation().insert('branch-1 only').toJSON(),
    });
    await ack;

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(crossTalk).toBe(false);

    // Confirm branch-2's document is untouched by fetching a late-join sync.
    const socketC = await connect(makeToken({ id: 'u3', username: 'carol' }));
    let sawSync = false;
    socketC.on('code:sync', (payload) => {
      sawSync = true;
      expect(payload.content).not.toContain('branch-1 only');
    });
    socketC.emit('room:join', 'branch-2');
    await new Promise((resolve) => setTimeout(resolve, 50));
    // branch-2 was never edited, so it has no OT doc yet — no sync is expected either.
    expect(sawSync).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
    socketC.disconnect();
  });

  it('still converges concurrent edits within the same branch', async () => {
    const roomId = 'branch-converge';
    const socketA = await connect(makeToken({ id: 'u4', username: 'dave' }));
    const socketB = await connect(makeToken({ id: 'u5', username: 'erin' }));

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      socketB.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const seedAck = new Promise((resolve) => socketA.once('code:ack', resolve));
    const seedOnB = new Promise((resolve) => socketB.once('code:op', resolve));
    socketA.emit('code:op', { roomId, revision: 0, operation: new TextOperation().insert('hi').toJSON() });
    await Promise.all([seedAck, seedOnB]);

    const ackA = new Promise((resolve) => socketA.once('code:ack', resolve));
    const onBFromA = new Promise((resolve) => socketB.once('code:op', resolve));
    socketA.emit('code:op', { roomId, revision: 1, operation: new TextOperation().retain(2).insert('!').toJSON() });
    await Promise.all([ackA, onBFromA]);

    const ackB = new Promise((resolve) => socketB.once('code:ack', resolve));
    socketB.emit('code:op', { roomId, revision: 1, operation: new TextOperation().insert('>>').retain(2).toJSON() });
    const finalAckB = await ackB;

    expect(finalAckB.revision).toBe(3);

    socketA.disconnect();
    socketB.disconnect();
  });
});

describe('room:leave', () => {
  it('removes the socket from presence for the left branch but not others', async () => {
    const socket = await connect(makeToken({ id: 'u6', username: 'frank' }));
    const other = await connect(makeToken({ id: 'u7', username: 'gina' }));

    await new Promise((resolve) => {
      socket.emit('room:join', 'branch-x');
      socket.emit('room:join', 'branch-y');
      other.emit('room:join', 'branch-x');
      setTimeout(resolve, 50);
    });

    const presenceUpdate = new Promise((resolve) => other.once('presence:update', resolve));
    socket.emit('room:leave', 'branch-x');
    const update = await presenceUpdate;

    expect(update.roomId).toBe('branch-x');
    expect(update.users.some((u) => u.userId === 'u6')).toBe(false);
    expect(update.users.some((u) => u.userId === 'u7')).toBe(true);

    // branch-y presence should be unaffected — leaving socket can still receive
    // cursor/presence traffic there.
    let branchYAffected = false;
    socket.on('presence:update', (p) => {
      if (p.roomId === 'branch-y') branchYAffected = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(branchYAffected).toBe(false);

    socket.disconnect();
    other.disconnect();
  });
});
