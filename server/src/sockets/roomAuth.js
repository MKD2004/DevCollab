const { isBranchMember, isRoomMember } = require('./authorize');
const { handleBranchJoin: presenceBranchJoin } = require('./presenceEvents');
const { handleBranchJoin: editorBranchJoin } = require('./editorEvents');

// Socket.io room name used for chat, kept separate from the branch ids used
// by presence/OT/run so the two namespaces can never collide.
function chatRoom(roomId) {
  return `chat:${roomId}`;
}

// Single gate for every realtime feature: a client must prove membership of
// the underlying DevCollab room before it can join a branch's presence/OT/run
// traffic (`room:join`) or a room's chat (`chat:join`). Other modules trust
// `socket.data.authorizedBranches` / `socket.data.authorizedChatRooms`
// (populated here) instead of re-checking the database on every event.
function registerRoomAuth(io, socket) {
  socket.data.authorizedBranches = new Set();
  socket.data.authorizedChatRooms = new Set();

  socket.on('room:join', async (branchId) => {
    if (typeof branchId !== 'string') return;

    let authorized;
    try {
      authorized = await isBranchMember(socket.data.user.id, branchId);
    } catch {
      authorized = false;
    }
    if (!authorized) {
      socket.emit('room:error', { roomId: branchId, message: 'Not authorized for this room' });
      return;
    }

    socket.data.authorizedBranches.add(branchId);
    socket.join(branchId);
    presenceBranchJoin(io, socket, branchId);
    editorBranchJoin(io, socket, branchId);
  });

  socket.on('room:leave', (branchId) => {
    if (typeof branchId !== 'string') return;
    socket.data.authorizedBranches.delete(branchId);
    socket.leave(branchId);
  });

  socket.on('chat:join', async (roomId) => {
    if (typeof roomId !== 'string') return;

    let authorized;
    try {
      authorized = await isRoomMember(socket.data.user.id, roomId);
    } catch {
      authorized = false;
    }
    if (!authorized) {
      socket.emit('chat:error', { roomId, message: 'Not authorized for this room' });
      return;
    }

    // Whether anyone else in this room is already this same user, checked
    // *before* joining so the joiner never counts as their own peer. Uses
    // fetchSockets (adapter-aware) rather than a local Map so the check still
    // holds when sockets are spread across instances behind the Redis adapter.
    let alreadyConnected = false;
    try {
      const peers = await io.in(chatRoom(roomId)).fetchSockets();
      alreadyConnected = peers.some((peer) => peer.data?.user?.id === socket.data.user.id);
    } catch {
      // Treat an adapter hiccup as "not connected" — a duplicate notification
      // is a far better failure mode than silently dropping a real one.
    }

    socket.data.authorizedChatRooms.add(roomId);
    socket.join(chatRoom(roomId));

    // Tell everyone already in the room that someone showed up. Suppressed
    // when the user simply opened a second tab or reconnected, so this fires
    // on a genuine arrival rather than on every socket.
    if (!alreadyConnected) {
      socket.to(chatRoom(roomId)).emit('member:joined', {
        roomId,
        userId: socket.data.user.id,
        username: socket.data.user.username,
        at: new Date().toISOString(),
      });
    }
  });

  socket.on('chat:leave', (roomId) => {
    if (typeof roomId !== 'string') return;
    socket.data.authorizedChatRooms.delete(roomId);
    socket.leave(chatRoom(roomId));
  });
}

module.exports = { registerRoomAuth, chatRoom };
