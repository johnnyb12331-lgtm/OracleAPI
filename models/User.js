const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true // Allow multiple documents with null/undefined email
  },
  password: {
    type: String,
    required: false
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  social_id: {
    type: String,
    required: false
  },
  provider: {
    type: String,
    enum: ['google', 'facebook', null],
    required: false
  },
  platform: {
    type: String,
    required: false
  },
  deviceTokens: [{
    type: String,
    required: false
  }]
}, {
  timestamps: true,
  collection: 'users'
});

module.exports = mongoose.model('User', userSchema);