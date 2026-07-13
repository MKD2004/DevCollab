const { createClient } = require('redis');

// Creates a connected pub and sub client pair for the Socket.io Redis
// adapter. Returns null if REDIS_URL isn't configured, so single-instance
// setups (local dev, tests) keep working without Redis.
async function createRedisClients() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => console.error('Redis pub client error', err));
  subClient.on('error', (err) => console.error('Redis sub client error', err));

  await Promise.all([pubClient.connect(), subClient.connect()]);

  return { pubClient, subClient };
}

module.exports = { createRedisClients };
