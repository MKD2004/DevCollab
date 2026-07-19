const piston = require('../services/piston');

// Code execution is run-and-broadcast: whoever clicks "Run" triggers it, but
// the request and result are shared with everyone currently viewing that
// branch, matching the app's realtime collaborative feel.
function registerRunEvents(io, socket) {
  socket.on('code:run', async ({ roomId, code, language }) => {
    if (typeof roomId !== 'string' || typeof code !== 'string' || typeof language !== 'string') return;
    if (!socket.data.authorizedBranches?.has(roomId)) return;

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
