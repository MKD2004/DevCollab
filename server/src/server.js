const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const createSocketServer = require('./sockets');
const { attachRedisAdapter } = require('./sockets');

const httpServer = http.createServer(app);
const io = createSocketServer(httpServer);
// Lets REST routes (e.g. join-requests) push a socket event after a DB
// write, without the socket layer depending on Express or vice versa.
app.set('io', io);

Promise.all([connectDB(), attachRedisAdapter(io)]).then(([, redisClients]) => {
  if (redisClients) console.log('Socket.io Redis adapter connected');
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
