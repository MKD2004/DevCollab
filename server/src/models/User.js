const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username must be at most 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

userSchema.statics.hashPassword = async (plaintext) => {
  return bcrypt.hash(plaintext, 12);
};

userSchema.methods.comparePassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
