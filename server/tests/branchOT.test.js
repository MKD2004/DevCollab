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
  const room = await Room.create({ name: 'branch test room', ownerId: owner, members: memberIds });
  const branch = await Branch.create({ roomId: room._id, name: `b-${Date.now()}-${Math.random()}`, createdBy: owner });
  return branch._id.toString();
}

// Creates a Branch belonging to an *existing* room, so two branches can
// share the same member list (mirrors branch-switching within one room).
async function makeBranchInRoom(roomId, creatorId) {
  const branch = await Branch.create({ roomId, name: `b-${Date.now()}-${Math.random()}`, createdBy: creatorId });
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

describe('per-branch OT isolation', () => {
  it('keeps edits on one branch from ever reaching another branch', async () => {
    const idA = new mongoose.Types.ObjectId().toString();
    const idB = new mongoose.Types.ObjectId().toString();
    const idC = new mongoose.Types.ObjectId().toString();
    const tokenA = makeToken({ id: idA, username: 'alice' });
    const tokenB = makeToken({ id: idB, username: 'bob' });
    const socketA = await connect(tokenA); // viewing branch1
    const socketB = await connect(tokenB); // viewing branch2

    const room = await Room.create({ name: 'isolation room', ownerId: idA, members: [idA, idB, idC] });
    const branch1 = (await Branch.create({ roomId: room._id, name: 'branch1', createdBy: idA }))._id.toString();
    const branch2 = (await Branch.create({ roomId: room._id, name: 'branch2', createdBy: idA }))._id.toString();

    await new Promise((resolve) => {
      socketA.emit('room:join', branch1);
      socketB.emit('room:join', branch2);
      setTimeout(resolve, 50);
    });

    let crossTalk = false;
    socketB.on('code:op', () => { crossTalk = true; });

    const ack = new Promise((resolve) => socketA.once('code:ack', resolve));
    socketA.emit('code:op', {
      roomId: branch1,
      revision: 0,
      operation: new TextOperation().insert('branch-1 only').toJSON(),
    });
    await ack;

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(crossTalk).toBe(false);

    // Confirm branch2's document is untouched by fetching a late-join sync.
    const socketC = await connect(makeToken({ id: idC, username: 'carol' }));
    let sawSync = false;
    socketC.on('code:sync', (payload) => {
      sawSync = true;
      expect(payload.content).not.toContain('branch-1 only');
    });
    socketC.emit('room:join', branch2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // branch2 was never edited, so it has no OT doc yet — no sync is expected either.
    expect(sawSync).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
    socketC.disconnect();
  });

  it('still converges concurrent edits within the same branch', async () => {
    const idD = new mongoose.Types.ObjectId().toString();
    const idE = new mongoose.Types.ObjectId().toString();
    const socketA = await connect(makeToken({ id: idD, username: 'dave' }));
    const socketB = await connect(makeToken({ id: idE, username: 'erin' }));
    const roomId = await makeBranch([idD, idE]);

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
    const idF = new mongoose.Types.ObjectId().toString();
    const idG = new mongoose.Types.ObjectId().toString();
    const socket = await connect(makeToken({ id: idF, username: 'frank' }));
    const other = await connect(makeToken({ id: idG, username: 'gina' }));

    const room = await Room.create({ name: 'leave room', ownerId: idF, members: [idF, idG] });
    const branchX = await makeBranchInRoom(room._id, idF);
    const branchY = await makeBranchInRoom(room._id, idF);

    await new Promise((resolve) => {
      socket.emit('room:join', branchX);
      socket.emit('room:join', branchY);
      other.emit('room:join', branchX);
      setTimeout(resolve, 50);
    });

    const presenceUpdate = new Promise((resolve) => other.once('presence:update', resolve));
    socket.emit('room:leave', branchX);
    const update = await presenceUpdate;

    expect(update.roomId).toBe(branchX);
    expect(update.users.some((u) => u.userId === idF)).toBe(false);
    expect(update.users.some((u) => u.userId === idG)).toBe(true);

    // branchY presence should be unaffected — leaving socket can still receive
    // cursor/presence traffic there.
    let branchYAffected = false;
    socket.on('presence:update', (p) => {
      if (p.roomId === branchY) branchYAffected = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(branchYAffected).toBe(false);

    socket.disconnect();
    other.disconnect();
  });
});
