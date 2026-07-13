const http = require('http');
const jwt = require('jsonwebtoken');
const { io: ioc } = require('socket.io-client');

require('dotenv').config();
process.env.JWT_SECRET = 'test-secret-key-for-jest';
process.env.NODE_ENV = 'test';

const createSocketServer = require('../src/sockets');
const { attachRedisAdapter } = require('../src/sockets');

// This suite proves the Socket.io Redis adapter actually fans broadcasts out
// across *separate* Node processes/servers, not just sockets within one
// process (which would pass even with zero Redis wiring). It requires a
// real REDIS_URL — skipped automatically when one isn't configured (e.g. CI
// without a Redis instance, or local dev without REDIS_URL set).
const REDIS_URL = process.env.REDIS_URL;
const describeIfRedis = REDIS_URL ? describe : describe.skip;

function makeToken(payload) {
  return jwt.sign({ id: 'user1', username: 'alice', ...payload }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

function startInstance() {
  return new Promise((resolve, reject) => {
    const httpServer = http.createServer();
    const io = createSocketServer(httpServer);
    attachRedisAdapter(io)
      .then((redisClients) => {
        httpServer.listen(0, () => {
          resolve({ httpServer, io, redisClients, port: httpServer.address().port });
        });
      })
      .catch(reject);
  });
}

function connect(port, token) {
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

async function stopInstance(instance) {
  instance.io.close();
  await new Promise((resolve) => instance.httpServer.close(resolve));
  if (instance.redisClients) {
    await instance.redisClients.pubClient.quit();
    await instance.redisClients.subClient.quit();
  }
}

describeIfRedis('Socket.io Redis adapter (cross-instance pub/sub)', () => {
  let instanceA, instanceB;

  beforeAll(async () => {
    [instanceA, instanceB] = await Promise.all([startInstance(), startInstance()]);
    // Sanity check: both instances actually attached a real adapter, not the in-memory default.
    expect(instanceA.redisClients).not.toBeNull();
    expect(instanceB.redisClients).not.toBeNull();
  }, 30000);

  afterAll(async () => {
    await Promise.all([stopInstance(instanceA), stopInstance(instanceB)]);
  });

  it('delivers presence:update from a client on instance A to a client on instance B', async () => {
    const roomId = `redis-room-${Date.now()}`;
    const clientOnB = await connect(instanceB.port, makeToken({ id: 'u1', username: 'onB' }));
    const clientOnA = await connect(instanceA.port, makeToken({ id: 'u2', username: 'onA' }));

    clientOnB.emit('room:join', roomId);
    await new Promise((resolve) => clientOnB.once('presence:update', resolve));

    const crossInstanceUpdate = new Promise((resolve) => {
      clientOnB.on('presence:update', (data) => {
        if (data.users.length === 2) resolve(data);
      });
    });

    clientOnA.emit('room:join', roomId);
    const data = await crossInstanceUpdate;

    expect(data.roomId).toBe(roomId);
    expect(data.users.map((u) => u.username).sort()).toEqual(['onA', 'onB']);

    clientOnA.disconnect();
    clientOnB.disconnect();
  }, 15000);

  it('delivers code:op broadcasts from instance A to a peer connected on instance B', async () => {
    const TextOperation = require('../src/ot/TextOperation');
    const roomId = `redis-ot-room-${Date.now()}`;
    const clientOnA = await connect(instanceA.port, makeToken({ id: 'u3', username: 'writer' }));
    const clientOnB = await connect(instanceB.port, makeToken({ id: 'u4', username: 'reader' }));

    await new Promise((resolve) => {
      clientOnA.emit('room:join', roomId);
      clientOnB.emit('room:join', roomId);
      setTimeout(resolve, 100);
    });

    const receivedOnB = new Promise((resolve) => clientOnB.once('code:op', resolve));
    clientOnA.emit('code:op', {
      roomId,
      revision: 0,
      operation: new TextOperation().insert('cross-instance').toJSON(),
    });

    const received = await receivedOnB;
    expect(TextOperation.fromJSON(received.operation).apply('')).toBe('cross-instance');

    clientOnA.disconnect();
    clientOnB.disconnect();
  }, 15000);
});

if (!REDIS_URL) {
  // eslint-disable-next-line jest/no-standalone-expect
  test.skip('REDIS_URL not set — Redis adapter tests skipped (see redis.test.js)', () => {});
}
