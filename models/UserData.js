const mongoose = require('mongoose');

const userDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Index for fast lookup by userId
  },
  name: {
    type: String,
    required: false
  },
  dateOfBirth: {
    type: Date,
    required: false
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: false
  },
  avatar: {
    type: String,
    required: false
  },
  profileMedia: [{
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    uploadedAt: { type: Date, default: Date.now },
    caption: { type: String, default: '' }
  }],
  bio: {
    type: String,
    required: false,
    maxlength: 255
  },
  location: {
    type: String,
    required: false
  },
  interests: [{
    type: String,
    required: false
  }],
  socialLinks: {
    instagram: { type: String, required: false },
    twitter: { type: String, required: false },
    linkedin: { type: String, required: false },
    website: { type: String, required: false },
    facebook: { type: String, required: false },
    tiktok: { type: String, required: false },
    snapchat: { type: String, required: false },
    youtube: { type: String, required: false }
  },
  profileViews: {
    type: Number,
    default: 0
  },
  privacySettings: {
    profileVisible: { type: Boolean, default: true },
    showLocation: { type: Boolean, default: true },
    showInterests: { type: Boolean, default: true },
    showSocialLinks: { type: Boolean, default: true },
    showBirthday: { type: Boolean, default: true }
  },
  notificationSettings: {
    pushNotificationsEnabled: { type: Boolean, default: true },
    likesEnabled: { type: Boolean, default: true },
    commentsEnabled: { type: Boolean, default: true },
    followsEnabled: { type: Boolean, default: true },
    mentionsEnabled: { type: Boolean, default: true },
    messagesEnabled: { type: Boolean, default: true },
    groupActivitiesEnabled: { type: Boolean, default: true }
  },
  achievements: [{
    type: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
    description: { type: String, required: true }
  }],
  isProfileComplete: {
    type: Boolean,
    default: false
  },
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  hiddenPosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: []
  }]
}, {
  timestamps: true,
  collection: 'usersdata'
});

// Create text index on name, bio, and interests for search
userDataSchema.index({ name: 'text', bio: 'text', interests: 'text' });

module.exports = mongoose.model('UserData', userDataSchema);