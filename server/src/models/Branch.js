const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
      minlength: [1, 'Branch name cannot be empty'],
      maxlength: [50, 'Branch name too long'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

branchSchema.index({ roomId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Branch', branchSchema);
