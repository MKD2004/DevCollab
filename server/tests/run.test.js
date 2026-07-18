const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

jest.mock('../src/services/piston');
const piston = require('../src/services/piston');
const { registerRunEvents } = require('../src/sockets/runEvents');

let httpServer, io, port;

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
    socket.on('room:join', (roomId) => socket.join(roomId));
    registerRunEvents(io, socket);
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('code:run', () => {
  it('broadcasts code:running then code:result to everyone in the branch room', async () => {
    piston.executeCode.mockResolvedValue({ stdout: 'hi\n', stderr: '', exitCode: 0, compileOutput: '' });

    const socketA = await connect(makeToken({ id: 'u1', username: 'alice' }));
    const socketB = await connect(makeToken({ id: 'u2', username: 'bob' }));
    const roomId = 'run-room-1';

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

    expect(running).toMatchObject({ roomId, userId: 'u1', username: 'alice' });
    expect(result).toMatchObject({ roomId, stdout: 'hi\n', stderr: '', exitCode: 0, ranBy: 'alice' });
    expect(piston.executeCode).toHaveBeenCalledWith({ language: 'python', code: 'print("hi")' });

    socketA.disconnect();
    socketB.disconnect();
  });

  it('emits code:error when Piston execution fails, without a code:result', async () => {
    piston.executeCode.mockRejectedValue(new Error('boom'));

    const socket = await connect(makeToken({ id: 'u3', username: 'carol' }));
    const roomId = 'run-room-2';

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

    const socketA = await connect(makeToken({ id: 'u4', username: 'dave' }));
    const socketB = await connect(makeToken({ id: 'u5', username: 'erin' }));

    await new Promise((resolve) => {
      socketA.emit('room:join', 'run-room-3a');
      socketB.emit('room:join', 'run-room-3b');
      setTimeout(resolve, 50);
    });

    let bReceived = false;
    socketB.on('code:running', () => { bReceived = true; });
    socketB.on('code:result', () => { bReceived = true; });

    const resultOnA = new Promise((resolve) => socketA.once('code:result', resolve));
    socketA.emit('code:run', { roomId: 'run-room-3a', code: 'x', language: 'javascript' });
    await resultOnA;

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bReceived).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
  });
});
