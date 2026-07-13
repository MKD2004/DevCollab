// In-memory editor state: roomId -> { content, language }
const roomEditorState = new Map();

function registerEditorEvents(io, socket) {
  socket.on('room:join', (roomId) => {
    const state = roomEditorState.get(roomId);
    if (state) {
      socket.emit('code:sync', { roomId, content: state.content, language: state.language });
    }
  });

  socket.on('code:change', ({ roomId, content, language }) => {
    if (typeof roomId !== 'string' || typeof content !== 'string') return;
    roomEditorState.set(roomId, { content, language: language || 'javascript' });
    socket.to(roomId).emit('code:change', { roomId, content, language });
  });

  socket.on('cursor:move', ({ roomId, position }) => {
    if (typeof roomId !== 'string' || !position) return;
    socket.to(roomId).emit('cursor:move', {
      roomId,
      userId: socket.data.user.id,
      username: socket.data.user.username,
      position,
    });
  });

  socket.on('disconnect', () => {
    if (!socket.data.rooms) return;
    for (const roomId of socket.data.rooms) {
      socket.to(roomId).emit('cursor:leave', {
        roomId,
        userId: socket.data.user.id,
      });
    }
  });
}

module.exports = { registerEditorEvents };
