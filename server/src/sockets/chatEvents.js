const Message = require('../models/Message');

const MAX_TEXT_LENGTH = 2000;

// Chat is scoped to the whole DevCollab room (not per-branch), so it uses
// its own socket.io room namespace — prefixed to avoid any collision with
// the branch ids used for presence/OT/run.
function chatRoom(roomId) {
  return `chat:${roomId}`;
}

function registerChatEvents(io, socket) {
  socket.on('chat:join', (roomId) => {
    if (typeof roomId !== 'string') return;
    socket.join(chatRoom(roomId));
  });

  socket.on('chat:leave', (roomId) => {
    if (typeof roomId !== 'string') return;
    socket.leave(chatRoom(roomId));
  });

  socket.on('chat:message', async ({ roomId, text }) => {
    if (typeof roomId !== 'string' || typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return;

    try {
      const message = await Message.create({
        roomId,
        userId: socket.data.user.id,
        username: socket.data.user.username,
        text: trimmed,
      });

      io.to(chatRoom(roomId)).emit('chat:message', {
        _id: message._id,
        roomId,
        userId: message.userId,
        username: message.username,
        text: message.text,
        createdAt: message.createdAt,
      });
    } catch {
      socket.emit('chat:error', { roomId, message: 'Failed to send message' });
    }
  });
}

module.exports = { registerChatEvents };
