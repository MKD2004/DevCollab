const mongoose = require('mongoose');

const joinRequestSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Only one pending request per user per room — doesn't block a fresh
// request after a prior one was declined, since this only applies while
// status is still 'pending'.
joinRequestSchema.index(
  { roomId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
