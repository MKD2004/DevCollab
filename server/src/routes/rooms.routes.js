const express = require('express');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Branch = require('../models/Branch');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

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
router.get('/join/:code', async (req, res) => {
  try {
    const room = await Room.findOne({
      joinCode: req.params.code.toUpperCase(),
    }).populate('ownerId', 'username');

    if (!room) return res.status(404).json({ message: 'Invalid join code' });

    const isMember = room.members.some((m) => m.toString() === req.user.id);
    if (!isMember) {
      room.members.push(req.user.id);
      await room.save();
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

    const room = await Room.findById(req.params.id).populate('ownerId', 'username');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isMember = room.members.some((m) => m.toString() === req.user.id);
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this room' });
    }

    res.json({ room });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
