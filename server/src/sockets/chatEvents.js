const Message = require('../models/Message');
const { chatRoom } = require('./roomAuth');

const MAX_TEXT_LENGTH = 2000;

function registerChatEvents(io, socket) {
  socket.on('chat:message', async ({ roomId, text }) => {
    if (typeof roomId !== 'string' || typeof text !== 'string') return;
    if (!socket.data.authorizedChatRooms?.has(roomId)) return;
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
