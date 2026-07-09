const mongoose = require('mongoose');

// Avoids visually ambiguous chars (0/O, 1/I)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  return Array.from({ length: 6 }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join('');
}

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      minlength: [1, 'Room name cannot be empty'],
      maxlength: [100, 'Room name too long'],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    joinCode: {
      type: String,
      unique: true,
      uppercase: true,
    },
  },
  { timestamps: true }
);

// Generate a unique join code before first save
roomSchema.pre('validate', async function (next) {
  if (!this.isNew || this.joinCode) return next();
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const exists = await mongoose.model('Room').findOne({ joinCode: code });
    if (!exists) {
      this.joinCode = code;
      return next();
    }
  }
  next(new Error('Could not generate a unique join code'));
});

module.exports = mongoose.model('Room', roomSchema);
