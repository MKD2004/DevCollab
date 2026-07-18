const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const { registerPresenceEvents } = require('./presenceEvents');
const { registerEditorEvents } = require('./editorEvents');
const { registerRunEvents } = require('./runEvents');
const { registerChatEvents } = require('./chatEvents');
const { createRedisClients } = require('../config/redis');

// Attaches the Redis pub/sub adapter to `io` so that io.to(room).emit(...)
// fans out across multiple Node processes, not just sockets on this one.
// No-ops (single-process mode) when REDIS_URL isn't configured.
async function attachRedisAdapter(io) {
  const clients = await createRedisClients();
  if (!clients) return null;
  const { pubClient, subClient } = clients;
  io.adapter(createAdapter(pubClient, subClient));
  return clients;
}

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // JWT auth middleware — runs before connection is established
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    registerPresenceEvents(io, socket);
    registerEditorEvents(io, socket);
    registerRunEvents(io, socket);
    registerChatEvents(io, socket);
  });

  return io;
}

module.exports = createSocketServer;
module.exports.attachRedisAdapter = attachRedisAdapter;
