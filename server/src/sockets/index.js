const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { registerPresenceEvents } = require('./presenceEvents');
const { registerEditorEvents } = require('./editorEvents');

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
  });

  return io;
}

module.exports = createSocketServer;
