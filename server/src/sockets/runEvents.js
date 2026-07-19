const piston = require('../services/piston');

// code:run hits the free public Piston API, which has no auth of its own —
// without a per-user throttle here, any authenticated user could hammer it
// as fast as the socket allows and risk getting DevCollab's server IP
// rate-limited or banned by emkc.org.
const RUN_THROTTLE_MS = 3000;
const MAX_CODE_LENGTH = 100_000; // generous for anything actually typed in the editor
const lastRunAt = new Map(); // userId -> timestamp

// Code execution is run-and-broadcast: whoever clicks "Run" triggers it, but
// the request and result are shared with everyone currently viewing that
// branch, matching the app's realtime collaborative feel.
function registerRunEvents(io, socket) {
  socket.on('code:run', async ({ roomId, code, language }) => {
    if (typeof roomId !== 'string' || typeof code !== 'string' || typeof language !== 'string') return;
    if (code.length > MAX_CODE_LENGTH) return;
    if (!socket.data.authorizedBranches?.has(roomId)) return;

    const userId = socket.data.user.id;
    const now = Date.now();
    const last = lastRunAt.get(userId) ?? 0;
    if (now - last < RUN_THROTTLE_MS) {
      socket.emit('code:error', { roomId, message: 'Please wait a moment before running again' });
      return;
    }
    lastRunAt.set(userId, now);

    io.to(roomId).emit('code:running', {
      roomId,
      userId: socket.data.user.id,
      username: socket.data.user.username,
    });

    try {
      const result = await piston.executeCode({ language, code });
      io.to(roomId).emit('code:result', {
        roomId,
        ...result,
        ranBy: socket.data.user.username,
      });
    } catch (err) {
      io.to(roomId).emit('code:error', { roomId, message: err.message });
    }
  });
}

module.exports = { registerRunEvents };
