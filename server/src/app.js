require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');
const roomsRoutes = require('./routes/rooms.routes');
const branchesRoutes = require('./routes/branches.routes');
const messagesRoutes = require('./routes/messages.routes');
const { corsOptions } = require('./config/cors');
const csrfProtection = require('./middleware/csrf.middleware');

const app = express();

// contentSecurityPolicy/COEP are meant for HTML pages — this is a pure JSON
// API with no HTML responses, so they're disabled to avoid interfering with
// the cross-origin frontend rather than protecting anything real here.
// crossOriginResourcePolicy defaults to 'same-origin', which browsers
// enforce independently of the Access-Control-Allow-Origin header above —
// left at the default, it would silently block the frontend (a different
// origin, especially once deployed) from reading any response at all.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ ...corsOptions, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(csrfProtection);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/rooms/:roomId/branches', branchesRoutes);
app.use('/api/rooms/:roomId/messages', messagesRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
