require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const roomsRoutes = require('./routes/rooms.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
