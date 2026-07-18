const express = require('express');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

const HISTORY_LIMIT = 50;

// Loads the parent room and verifies the requester is a member. Writes an
// error response and returns null if the room doesn't exist or isn't theirs.
async function loadRoomForMember(req, res) {
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

  const isMember = room.members.some((m) => m.toString() === req.user.id);
  if (!isMember) {
    res.status(403).json({ message: 'Not a member of this room' });
    return null;
  }

  return room;
}

// GET /api/rooms/:roomId/messages — most recent chat history, oldest first
router.get('/', async (req, res) => {
  try {
    const room = await loadRoomForMember(req, res);
    if (!room) return;

    const messages = await Message.find({ roomId: room._id })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT);

    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
