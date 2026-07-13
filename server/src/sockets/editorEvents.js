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
}

module.exports = { registerEditorEvents };
