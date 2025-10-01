const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    unique: true
  },
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date
    },
    status: {
      type: String,
      enum: ['invited', 'joined', 'declined', 'missed'],
      default: 'invited'
    }
  }],
  callType: {
    type: String,
    enum: ['one-on-one', 'group'],
    required: true
  },
  status: {
    type: String,
    enum: ['ringing', 'ongoing', 'ended', 'missed'],
    default: 'ringing'
  },
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  isVideo: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
callSchema.index({ callerId: 1, createdAt: -1 });
callSchema.index({ 'participants.userId': 1, createdAt: -1 });

module.exports = mongoose.model('Call', callSchema);