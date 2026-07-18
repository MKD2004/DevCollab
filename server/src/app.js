require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const roomsRoutes = require('./routes/rooms.routes');
const branchesRoutes = require('./routes/branches.routes');
const messagesRoutes = require('./routes/messages.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/rooms/:roomId/branches', branchesRoutes);
app.use('/api/rooms/:roomId/messages', messagesRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
