const mongoose = require('mongoose');
const Room = require('../models/Room');
const Branch = require('../models/Branch');

// Is `userId` a member of the DevCollab room `roomId`?
async function isRoomMember(userId, roomId) {
  if (!mongoose.Types.ObjectId.isValid(roomId)) return false;
  const room = await Room.findById(roomId).select('members');
  if (!room) return false;
  return room.members.some((m) => m.toString() === userId);
}

// Branch ids are what the presence/OT/run socket layer actually uses as its
// "roomId" — resolve the branch to its parent room, then check membership.
async function isBranchMember(userId, branchId) {
  if (!mongoose.Types.ObjectId.isValid(branchId)) return false;
  const branch = await Branch.findById(branchId).select('roomId');
  if (!branch) return false;
  return isRoomMember(userId, branch.roomId.toString());
}

module.exports = { isRoomMember, isBranchMember };
