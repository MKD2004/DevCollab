const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const createSocketServer = require('./sockets');

const httpServer = http.createServer(app);
createSocketServer(httpServer);

connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
