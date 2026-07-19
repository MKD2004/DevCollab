// Single source of truth for "who can act as the room's manager" — used by
// both admin management (owner-only) and join-request handling (owner or
// admin). Keeping this isolated means extending who counts as a manager
// later is a one-line change here, not a hunt across every ownerId check.
function isRoomOwner(room, userId) {
  return room.ownerId.toString() === userId;
}

function isRoomOwnerOrAdmin(room, userId) {
  return isRoomOwner(room, userId) || room.admins.some((a) => a.toString() === userId);
}

module.exports = { isRoomOwner, isRoomOwnerOrAdmin };
