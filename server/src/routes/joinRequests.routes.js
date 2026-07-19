const express = require('express');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const JoinRequest = require('../models/JoinRequest');
const authMiddleware = require('../middleware/auth.middleware');
const { joinCodeLimiter } = require('../middleware/rateLimit');
const { isRoomOwnerOrAdmin } = require('../utils/roomPermissions');
const { chatRoom } = require('../sockets/roomAuth');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

// Loads the parent room by id, no membership required (unlike
// branches/messages routes) — a non-member requesting to join is the
// whole point of this route file. Writes an error response and returns
// null if the room doesn't exist.
async function loadRoomById(req, res) {
  const { roomId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    res.status(404).json({ message: 'Room not found' });
    return null;
  }

  const room = await Room.findById(roomId);
  if (!room) {
    res.status(404).json({ message: 'Room not found' });
    return null;
  }

  return room;
}

// Tells the owner and every admin that a request is no longer pending, so a
// request acted on from one place (notification card, Requests panel, another
// admin's session) disappears everywhere instead of lingering until reload.
function notifyHandled(io, room, request, status) {
  if (!io) return;
  const payload = {
    roomId: room._id.toString(),
    requestId: request._id.toString(),
    username: request.username,
    status,
  };
  for (const managerId of [room.ownerId, ...room.admins]) {
    io.to(`user:${managerId}`).emit('join-request:handled', payload);
  }
}

// POST /api/rooms/:roomId/join-requests — request to join a room you're
// not a member of. Idempotent: re-requesting while a pending request
// already exists just returns that same request instead of erroring.
router.post('/', joinCodeLimiter, async (req, res) => {
  try {
    const room = await loadRoomById(req, res);
    if (!room) return;

    const isMember = room.members.some((m) => m.toString() === req.user.id);
    if (isMember) {
      return res.status(400).json({ message: 'Already a member of this room' });
    }

    const existing = await JoinRequest.findOne({
      roomId: room._id,
      userId: req.user.id,
      status: 'pending',
    });
    if (existing) {
      return res.status(200).json({ request: existing });
    }

    const request = await JoinRequest.create({
      roomId: room._id,
      userId: req.user.id,
      username: req.user.username,
    });

    const io = req.app.get('io');
    if (io) {
      const payload = {
        roomId: room._id.toString(),
        // Included so the notification can name the room without the
        // recipient having that room's page open to look it up.
        roomName: room.name,
        requestId: request._id.toString(),
        username: req.user.username,
      };
      // Owner and every current admin can act on this — all get the nudge.
      for (const managerId of [room.ownerId, ...room.admins]) {
        io.to(`user:${managerId}`).emit('join-request:created', payload);
      }
    }

    res.status(201).json({ request });
  } catch (err) {
    if (err.code === 11000) {
      // Lost a race against a duplicate pending request from the same user.
      const existing = await JoinRequest.findOne({
        roomId: req.params.roomId,
        userId: req.user.id,
        status: 'pending',
      });
      return res.status(200).json({ request: existing });
    }
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rooms/:roomId/join-requests — owner or admin, lists pending requests.
router.get('/', async (req, res) => {
  try {
    const room = await loadRoomById(req, res);
    if (!room) return;

    if (!isRoomOwnerOrAdmin(room, req.user.id)) {
      return res.status(403).json({ message: 'Only the room owner or an admin can view join requests' });
    }

    const requests = await JoinRequest.find({ roomId: room._id, status: 'pending' }).sort({ createdAt: 1 });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms/:roomId/join-requests/:requestId/accept — owner or admin.
router.post('/:requestId/accept', async (req, res) => {
  try {
    const room = await loadRoomById(req, res);
    if (!room) return;

    if (!isRoomOwnerOrAdmin(room, req.user.id)) {
      return res.status(403).json({ message: 'Only the room owner or an admin can accept join requests' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) {
      return res.status(404).json({ message: 'Join request not found' });
    }
    const request = await JoinRequest.findOne({
      _id: req.params.requestId,
      roomId: room._id,
      status: 'pending',
    });
    if (!request) return res.status(404).json({ message: 'Join request not found' });

    request.status = 'accepted';
    await request.save();

    const isMember = room.members.some((m) => m.toString() === request.userId.toString());
    if (!isMember) {
      room.members.push(request.userId);
      await room.save();
    }

    const io = req.app.get('io');
    io?.to(`user:${request.userId}`).emit('join-request:resolved', {
      roomId: room._id.toString(),
      status: 'accepted',
    });
    // Everyone else already viewing this room has a stale member list now.
    io?.to(chatRoom(room._id.toString())).emit('room:updated', { roomId: room._id.toString() });
    notifyHandled(io, room, request, 'accepted');

    res.json({ request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms/:roomId/join-requests/:requestId/decline — owner or admin.
router.post('/:requestId/decline', async (req, res) => {
  try {
    const room = await loadRoomById(req, res);
    if (!room) return;

    if (!isRoomOwnerOrAdmin(room, req.user.id)) {
      return res.status(403).json({ message: 'Only the room owner or an admin can decline join requests' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) {
      return res.status(404).json({ message: 'Join request not found' });
    }
    const request = await JoinRequest.findOne({
      _id: req.params.requestId,
      roomId: room._id,
      status: 'pending',
    });
    if (!request) return res.status(404).json({ message: 'Join request not found' });

    request.status = 'declined';
    await request.save();

    const io = req.app.get('io');
    io?.to(`user:${request.userId}`).emit('join-request:resolved', {
      roomId: room._id.toString(),
      status: 'declined',
    });
    notifyHandled(io, room, request, 'declined');

    res.json({ request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
