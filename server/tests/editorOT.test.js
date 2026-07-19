const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const { registerPresenceEvents } = require('../src/sockets/presenceEvents');
const { registerEditorEvents } = require('../src/sockets/editorEvents');
const { registerRoomAuth } = require('../src/sockets/roomAuth');
const TextOperation = require('../src/ot/TextOperation');
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
  const room = await Room.create({ name: 'ot test room', ownerId: owner, members: memberIds });
  const branch = await Branch.create({ roomId: room._id, name: `b-${Date.now()}-${Math.random()}`, createdBy: owner });
  return branch._id.toString();
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

describe('room:join authorization', () => {
  it('rejects room:join for a user who is not a member of the branch\'s room, and blocks code:op on that branch even without joining', async () => {
    const memberId = new mongoose.Types.ObjectId().toString();
    const outsiderId = new mongoose.Types.ObjectId().toString();
    const roomId = await makeBranch([memberId]);

    const outsider = await connect(makeToken({ id: outsiderId, username: 'mallory' }));

    const errorPromise = new Promise((resolve) => outsider.once('room:error', resolve));
    outsider.emit('room:join', roomId);
    const error = await errorPromise;
    expect(error.roomId).toBe(roomId);

    // Even without a successful room:join, a forged code:op for that branch
    // id must be dropped rather than transforming/broadcasting content.
    let ackReceived = false;
    outsider.once('code:ack', () => { ackReceived = true; });
    outsider.emit('code:op', { roomId, revision: 0, operation: new TextOperation().insert('hack').toJSON() });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ackReceived).toBe(false);

    outsider.disconnect();
  });

  it('rejects room:join for a nonexistent branch id', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const socket = await connect(makeToken({ id: userId, username: 'nobody' }));

    const errorPromise = new Promise((resolve) => socket.once('room:error', resolve));
    socket.emit('room:join', new mongoose.Types.ObjectId().toString());
    const error = await errorPromise;
    expect(error.message).toMatch(/not authorized/i);

    socket.disconnect();
  });
});

describe('code:op', () => {
  it('acks the sender and broadcasts the transformed op to peers', async () => {
    const idA = new mongoose.Types.ObjectId().toString();
    const idB = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idA, username: 'alice' });
    const tokenB = makeToken({ id: idB, username: 'bob' });
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);
    const roomId = await makeBranch([idA, idB]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      socketB.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const op = new TextOperation().insert('hello');
    const [ackPromise, opPromise] = [
      new Promise((resolve) => socketA.once('code:ack', resolve)),
      new Promise((resolve) => socketB.once('code:op', resolve)),
    ];

    socketA.emit('code:op', { roomId, revision: 0, operation: op.toJSON(), language: 'javascript' });

    const [ack, received] = await Promise.all([ackPromise, opPromise]);
    expect(ack.revision).toBe(1);
    expect(received.revision).toBe(1);
    expect(TextOperation.fromJSON(received.operation).apply('')).toBe('hello');

    socketA.disconnect();
    socketB.disconnect();
  });

  it('does not echo the op back to the sender', async () => {
    const idC = new mongoose.Types.ObjectId().toString();
    const token = makeToken({ id: idC, username: 'carol' });
    const socket = await connect(token);
    const roomId = await makeBranch([idC]);

    await new Promise((resolve) => {
      socket.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    let echoed = false;
    socket.on('code:op', () => { echoed = true; });
    socket.emit('code:op', { roomId, revision: 0, operation: new TextOperation().insert('x').toJSON() });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(echoed).toBe(false);
    socket.disconnect();
  });

  it('transforms concurrent ops from two clients so both edits survive', async () => {
    const idD = new mongoose.Types.ObjectId().toString();
    const idE = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idD, username: 'dave' });
    const tokenB = makeToken({ id: idE, username: 'erin' });
    const socketA = await connect(tokenA);
    const socketB = await connect(tokenB);
    const roomId = await makeBranch([idD, idE]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      socketB.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    // Seed the document to "hello" via A, both now at revision 1
    const seedAck = new Promise((resolve) => socketA.once('code:ack', resolve));
    const seedOnB = new Promise((resolve) => socketB.once('code:op', resolve));
    socketA.emit('code:op', { roomId, revision: 0, operation: new TextOperation().insert('hello').toJSON() });
    await Promise.all([seedAck, seedOnB]);

    // A and B concurrently submit ops against revision 1, unaware of each other
    const opA = new TextOperation().retain(5).insert('!'); // "hello!"
    const opB = new TextOperation().insert('>>').retain(5); // ">>hello"

    const ackA = new Promise((resolve) => socketA.once('code:ack', resolve));
    const onBFromA = new Promise((resolve) => socketB.once('code:op', resolve));
    socketA.emit('code:op', { roomId, revision: 1, operation: opA.toJSON() });
    await Promise.all([ackA, onBFromA]);

    const ackB = new Promise((resolve) => socketB.once('code:ack', resolve));
    const onAFromB = new Promise((resolve) => socketA.once('code:op', resolve));
    socketB.emit('code:op', { roomId, revision: 1, operation: opB.toJSON() });
    const [finalAckB, finalOnA] = await Promise.all([ackB, onAFromB]);

    expect(finalAckB.revision).toBe(3);
    expect(finalOnA.revision).toBe(3);

    // Apply B's transformed op (as received by A) on top of what A already has ("hello!")
    const finalDoc = TextOperation.fromJSON(finalOnA.operation).apply('hello!');
    expect(finalDoc).toContain('hello');
    expect(finalDoc).toContain('!');
    expect(finalDoc).toContain('>>');

    socketA.disconnect();
    socketB.disconnect();
  });

  it('forces a resync when the submitted revision is invalid', async () => {
    const idF = new mongoose.Types.ObjectId().toString();
    const token = makeToken({ id: idF, username: 'frank' });
    const socket = await connect(token);
    const roomId = await makeBranch([idF]);

    await new Promise((resolve) => {
      socket.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const seedAck = new Promise((resolve) => socket.once('code:ack', resolve));
    socket.emit('code:op', { roomId, revision: 0, operation: new TextOperation().insert('abc').toJSON() });
    await seedAck;

    const syncPromise = new Promise((resolve) => socket.once('code:sync', resolve));
    // revision 99 is far beyond history length (1) — server must reject and resync
    socket.emit('code:op', { roomId, revision: 99, operation: new TextOperation().insert('x').toJSON() });

    const sync = await syncPromise;
    expect(sync.content).toBe('abc');
    expect(sync.revision).toBe(1);

    socket.disconnect();
  });

  it('sends revision alongside content on late-join sync', async () => {
    const idG = new mongoose.Types.ObjectId().toString();
    const idH = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idG, username: 'gina' });
    const tokenB = makeToken({ id: idH, username: 'hank' });
    const socketA = await connect(tokenA);
    const roomId = await makeBranch([idG, idH]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const ack = new Promise((resolve) => socketA.once('code:ack', resolve));
    socketA.emit('code:op', { roomId, revision: 0, operation: new TextOperation().insert('sync me').toJSON() });
    await ack;

    const socketB = await connect(tokenB);
    const sync = await new Promise((resolve) => {
      socketB.on('code:sync', resolve);
      socketB.emit('room:join', roomId);
    });

    expect(sync.content).toBe('sync me');
    expect(sync.revision).toBe(1);

    socketA.disconnect();
    socketB.disconnect();
  });
});
