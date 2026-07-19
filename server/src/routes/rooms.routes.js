const express = require('express');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Branch = require('../models/Branch');
const authMiddleware = require('../middleware/auth.middleware');
const { joinCodeLimiter } = require('../middleware/rateLimit');
const { isRoomOwner } = require('../utils/roomPermissions');
const { chatRoom } = require('../sockets/roomAuth');

const router = express.Router();

router.use(authMiddleware);

// Tells every already-connected client currently viewing this room (via the
// chat:join socket room, joined by anyone with the room page open) to
// refetch — membership/role changed and their local room state is stale.
function broadcastRoomUpdated(req, roomId) {
  req.app.get('io')?.to(chatRoom(roomId.toString())).emit('room:updated', { roomId: roomId.toString() });
}

// POST /api/rooms — create a room, creator is owner + first member
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Room name is required' });
    }
    const room = await Room.create({
      name: name.trim(),
      ownerId: req.user.id,
      members: [req.user.id],
    });
    await Branch.create({
      roomId: room._id,
      name: 'main',
      createdBy: req.user.id,
      isDefault: true,
    });
    res.status(201).json({ room });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rooms — list all rooms where the user is a member
router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user.id })
      .populate('ownerId', 'username')
      .sort({ updatedAt: -1 });
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rooms/join/:code — find and auto-join a room by its join code
// Must be before /:id so Express doesn't treat "join" as an ObjectId
router.get('/join/:code', joinCodeLimiter, async (req, res) => {
  try {
    const room = await Room.findOne({
      joinCode: req.params.code.toUpperCase(),
    }).populate('ownerId', 'username');

    if (!room) return res.status(404).json({ message: 'Invalid join code' });

    const isMember = room.members.some((m) => m.toString() === req.user.id);
    if (!isMember) {
      room.members.push(req.user.id);
      await room.save();
      broadcastRoomUpdated(req, room._id);
    }

    res.json({ room });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rooms/:id — get a room by ID; requester must already be a member.
// Joining an unfamiliar room requires the join-code flow (GET /join/:code).
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const room = await Room.findById(req.params.id)
      .populate('ownerId', 'username')
      .populate('members', 'username')
      .populate('admins', 'username');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMember = room.members.some((m) => m._id.toString() === req.user.id);
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this room' });
    }

    res.json({ room });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rooms/:id/preview — minimal info (name only) for any
// authenticated user, member or not. Lets a non-member see what they'd be
// requesting to join without leaking the join code or member list.
router.get('/:id/preview', joinCodeLimiter, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const room = await Room.findById(req.params.id).select('name');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    res.json({ room: { _id: room._id, name: room.name } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms/:id/admins — promote a member to admin. Owner-only.
router.post('/:id/admins', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Room not found' });
    }
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (!isRoomOwner(room, req.user.id)) {
      return res.status(403).json({ message: 'Only the room owner can manage admins' });
    }

    const { userId } = req.body;
    if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'A valid userId is required' });
    }
    if (userId === room.ownerId.toString()) {
      return res.status(400).json({ message: 'The owner is already the room manager' });
    }
    if (!room.members.some((m) => m.toString() === userId)) {
      return res.status(400).json({ message: 'User is not a member of this room' });
    }
    if (room.admins.some((a) => a.toString() === userId)) {
      return res.status(400).json({ message: 'Already an admin' });
    }

    room.admins.push(userId);
    await room.save();
    broadcastRoomUpdated(req, room._id);
    res.status(201).json({ admins: room.admins });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/rooms/:id/admins/:userId — demote an admin. Owner-only.
router.delete('/:id/admins/:userId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Room not found' });
    }
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (!isRoomOwner(room, req.user.id)) {
      return res.status(403).json({ message: 'Only the room owner can manage admins' });
    }

    const { userId } = req.params;
    const wasAdmin = room.admins.some((a) => a.toString() === userId);
    if (!wasAdmin) return res.status(404).json({ message: 'Not an admin of this room' });

    room.admins = room.admins.filter((a) => a.toString() !== userId);
    await room.save();
    broadcastRoomUpdated(req, room._id);
    res.json({ admins: room.admins });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rooms/:id/leave — leave a room. The owner is a special case:
// leaving requires an explicit ownership handoff to an existing admin, so
// the room is never left without anyone able to manage it (e.g. accept
// join requests) — see roomPermissions.js.
router.post('/:id/leave', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Room not found' });
    }
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMember = room.members.some((m) => m.toString() === req.user.id);
    if (!isMember) return res.status(400).json({ message: 'Not a member of this room' });

    if (isRoomOwner(room, req.user.id)) {
      if (room.admins.length === 0) {
        return res.status(400).json({
          message: 'Promote a member to admin before leaving — there’s no one to hand ownership to.',
        });
      }

      const { newOwnerId } = req.body;
      const isValidAdmin =
        typeof newOwnerId === 'string' && room.admins.some((a) => a.toString() === newOwnerId);
      if (!isValidAdmin) {
        return res.status(400).json({ message: 'Selected user is not an admin of this room' });
      }

      room.ownerId = newOwnerId;
      room.admins = room.admins.filter((a) => a.toString() !== newOwnerId);
      room.members = room.members.filter((m) => m.toString() !== req.user.id);
      await room.save();
      broadcastRoomUpdated(req, room._id);
      return res.json({ message: 'Ownership transferred, left the room' });
    }

    room.members = room.members.filter((m) => m.toString() !== req.user.id);
    room.admins = room.admins.filter((a) => a.toString() !== req.user.id);
    await room.save();
    broadcastRoomUpdated(req, room._id);
    res.json({ message: 'Left the room' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
