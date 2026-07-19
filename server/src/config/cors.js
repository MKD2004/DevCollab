// CLIENT_ORIGIN accepts a comma-separated list so staging/prod can allow
// more than one frontend origin. Falls back to the local Vite dev server.
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: allowedOrigins,
};

module.exports = { allowedOrigins, corsOptions };
