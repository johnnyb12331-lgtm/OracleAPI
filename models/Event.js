const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: false // null for general events, set for group events
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    required: false,
    maxlength: 500
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  virtualLink: {
    type: String,
    required: false
  },
  maxAttendees: {
    type: Number,
    required: false,
    min: 1
  },
  category: {
    type: String,
    enum: ['social', 'business', 'education', 'entertainment', 'sports', 'other'],
    default: 'other'
  },
  image: {
    type: String, // URL or path to event image
    required: false
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserData'
    },
    rsvpStatus: {
      type: String,
      enum: ['going', 'maybe', 'not_going'],
      default: 'going'
    },
    rsvpDate: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [{
    type: String,
    maxlength: 50
  }],
  isCancelled: {
    type: Boolean,
    default: false
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancellationReason: {
    type: String,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'events'
});

// Index for efficient queries
eventSchema.index({ startDate: 1, endDate: 1 });
eventSchema.index({ organizer: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ isPublic: 1 });
eventSchema.index({ 'attendees.user': 1 });

// Virtual for attendee count
eventSchema.virtual('attendeeCount').get(function() {
  return this.attendees.length;
});

// Virtual for confirmed attendees
eventSchema.virtual('confirmedAttendees').get(function() {
  return this.attendees.filter(attendee => attendee.rsvpStatus === 'going').length;
});

// Ensure virtual fields are serialized
eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Event', eventSchema);