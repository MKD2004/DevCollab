// In-memory presence: roomId -> Map<socketId, { userId, username }>
const roomPresence = new Map();

function getPresenceList(roomId) {
  const room = roomPresence.get(roomId);
  if (!room) return [];
  return Array.from(room.values());
}

function registerPresenceEvents(io, socket) {
  const { id: userId, username } = socket.data.user;

  socket.on('room:join', (roomId) => {
    socket.join(roomId);

    if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
    roomPresence.get(roomId).set(socket.id, { userId, username });

    if (!socket.data.rooms) socket.data.rooms = new Set();
    socket.data.rooms.add(roomId);

    io.to(roomId).emit('presence:update', {
      roomId,
      users: getPresenceList(roomId),
    });
  });

  socket.on('room:leave', (roomId) => {
    socket.leave(roomId);

    const room = roomPresence.get(roomId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) roomPresence.delete(roomId);
      else {
        io.to(roomId).emit('presence:update', {
          roomId,
          users: getPresenceList(roomId),
        });
      }
    }

    if (socket.data.rooms) socket.data.rooms.delete(roomId);
  });

  socket.on('disconnect', () => {
    if (!socket.data.rooms) return;
    for (const roomId of socket.data.rooms) {
      const room = roomPresence.get(roomId);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) roomPresence.delete(roomId);
        else {
          io.to(roomId).emit('presence:update', {
            roomId,
            users: getPresenceList(roomId),
          });
        }
      }
    }
  });
}

module.exports = { registerPresenceEvents };
