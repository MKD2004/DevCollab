const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

jest.mock('../src/services/piston');
const piston = require('../src/services/piston');
const { registerRunEvents } = require('../src/sockets/runEvents');
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
  const room = await Room.create({ name: 'run test room', ownerId: owner, members: memberIds });
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
    registerRunEvents(io, socket);
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

afterEach(() => {
  jest.clearAllMocks();
});

describe('code:run authorization', () => {
  it('drops code:run for a branch the socket never joined/was authorized for', async () => {
    const memberId = new mongoose.Types.ObjectId().toString();
    const outsiderId = new mongoose.Types.ObjectId().toString();
    const roomId = await makeBranch([memberId]);
    const outsider = await connect(makeToken({ id: outsiderId, username: 'mallory' }));

    let sawRunning = false;
    outsider.on('code:running', () => { sawRunning = true; });
    outsider.emit('code:run', { roomId, code: 'x', language: 'javascript' });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sawRunning).toBe(false);
    expect(piston.executeCode).not.toHaveBeenCalled();

    outsider.disconnect();
  });
});

describe('code:run', () => {
  it('broadcasts code:running then code:result to everyone in the branch room', async () => {
    piston.executeCode.mockResolvedValue({ stdout: 'hi\n', stderr: '', exitCode: 0, compileOutput: '' });

    const idA = new mongoose.Types.ObjectId().toString();
    const idB = new mongoose.Types.ObjectId().toString();
    const socketA = await connect(makeToken({ id: idA, username: 'alice' }));
    const socketB = await connect(makeToken({ id: idB, username: 'bob' }));
    const roomId = await makeBranch([idA, idB]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomId);
      socketB.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const runningOnB = new Promise((resolve) => socketB.once('code:running', resolve));
    const resultOnB = new Promise((resolve) => socketB.once('code:result', resolve));
    const runningOnA = new Promise((resolve) => socketA.once('code:running', resolve));
    const resultOnA = new Promise((resolve) => socketA.once('code:result', resolve));

    socketA.emit('code:run', { roomId, code: 'print("hi")', language: 'python' });

    const [running, result] = await Promise.all([runningOnB, resultOnB]);
    await Promise.all([runningOnA, resultOnA]);

    expect(running).toMatchObject({ roomId, userId: idA, username: 'alice' });
    expect(result).toMatchObject({ roomId, stdout: 'hi\n', stderr: '', exitCode: 0, ranBy: 'alice' });
    expect(piston.executeCode).toHaveBeenCalledWith({ language: 'python', code: 'print("hi")' });

    socketA.disconnect();
    socketB.disconnect();
  });

  it('throttles rapid repeat runs from the same user instead of hammering Piston', async () => {
    piston.executeCode.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, compileOutput: '' });

    const idT = new mongoose.Types.ObjectId().toString();
    const socket = await connect(makeToken({ id: idT, username: 'throttled' }));
    const roomId = await makeBranch([idT]);

    await new Promise((resolve) => {
      socket.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    const firstResult = new Promise((resolve) => socket.once('code:result', resolve));
    socket.emit('code:run', { roomId, code: 'a', language: 'python' });
    await firstResult;

    const throttleError = new Promise((resolve) => socket.once('code:error', resolve));
    socket.emit('code:run', { roomId, code: 'b', language: 'python' });
    const error = await throttleError;

    expect(error.message).toMatch(/wait/i);
    expect(piston.executeCode).toHaveBeenCalledTimes(1);

    socket.disconnect();
  });

  it('emits code:error when Piston execution fails, without a code:result', async () => {
    piston.executeCode.mockRejectedValue(new Error('boom'));

    const idC = new mongoose.Types.ObjectId().toString();
    const socket = await connect(makeToken({ id: idC, username: 'carol' }));
    const roomId = await makeBranch([idC]);

    await new Promise((resolve) => {
      socket.emit('room:join', roomId);
      setTimeout(resolve, 50);
    });

    let sawResult = false;
    socket.on('code:result', () => { sawResult = true; });

    const errorPromise = new Promise((resolve) => socket.once('code:error', resolve));
    socket.emit('code:run', { roomId, code: 'bad', language: 'python' });
    const error = await errorPromise;

    expect(error).toEqual({ roomId, message: 'boom' });
    expect(sawResult).toBe(false);

    socket.disconnect();
  });

  it('does not broadcast to sockets in a different branch room', async () => {
    piston.executeCode.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, compileOutput: '' });

    const idD = new mongoose.Types.ObjectId().toString();
    const idE = new mongoose.Types.ObjectId().toString();
    const socketA = await connect(makeToken({ id: idD, username: 'dave' }));
    const socketB = await connect(makeToken({ id: idE, username: 'erin' }));
    const roomA = await makeBranch([idD]);
    const roomB = await makeBranch([idE]);

    await new Promise((resolve) => {
      socketA.emit('room:join', roomA);
      socketB.emit('room:join', roomB);
      setTimeout(resolve, 50);
    });

    let bReceived = false;
    socketB.on('code:running', () => { bReceived = true; });
    socketB.on('code:result', () => { bReceived = true; });

    const resultOnA = new Promise((resolve) => socketA.once('code:result', resolve));
    socketA.emit('code:run', { roomId: roomA, code: 'x', language: 'javascript' });
    await resultOnA;

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bReceived).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
  });
});
