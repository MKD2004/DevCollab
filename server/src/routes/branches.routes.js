const express = require('express');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Branch = require('../models/Branch');
const authMiddleware = require('../middleware/auth.middleware');
const { getOTDocState, seedOTDocState } = require('../sockets/editorEvents');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);

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

// POST /api/rooms/:roomId/branches — create a branch, optionally forking
// another branch's current content
router.post('/', async (req, res) => {
  try {
    const room = await loadRoomForMember(req, res);
    if (!room) return;

    const { name, fromBranchId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Branch name is required' });
    }

    if (fromBranchId) {
      if (!mongoose.Types.ObjectId.isValid(fromBranchId)) {
        return res.status(400).json({ message: 'Invalid fromBranchId' });
      }
      const sourceBranch = await Branch.findOne({ _id: fromBranchId, roomId: room._id });
      if (!sourceBranch) {
        return res.status(404).json({ message: 'Source branch not found in this room' });
      }
    }

    let branch;
    try {
      branch = await Branch.create({
        roomId: room._id,
        name: name.trim(),
        createdBy: req.user.id,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: 'A branch with that name already exists in this room' });
      }
      throw err;
    }

    if (fromBranchId) {
      const sourceState = getOTDocState(fromBranchId);
      if (sourceState) {
        seedOTDocState(branch._id.toString(), sourceState.content, sourceState.language);
      }
    }

    res.status(201).json({ branch });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/rooms/:roomId/branches — list branches, default branch first
router.get('/', async (req, res) => {
  try {
    const room = await loadRoomForMember(req, res);
    if (!room) return;

    const branches = await Branch.find({ roomId: room._id }).sort({ isDefault: -1, createdAt: 1 });
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/rooms/:roomId/branches/:branchId — rename a branch. Any room
// member can rename any branch (same permission level as creating one) —
// renaming main is allowed too, same as git.
router.patch('/:branchId', async (req, res) => {
  try {
    const room = await loadRoomForMember(req, res);
    if (!room) return;

    const { branchId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(branchId)) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Branch name is required' });
    }

    const branch = await Branch.findOne({ _id: branchId, roomId: room._id });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    branch.name = name.trim();
    try {
      await branch.save();
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: 'A branch with that name already exists in this room' });
      }
      throw err;
    }

    res.json({ branch });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
