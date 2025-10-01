const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'paypal', 'in_app', 'bank_transfer'],
    default: 'in_app'
  },
  transactionId: {
    type: String, // External payment processor transaction ID
    required: false
  },
  downloadUrl: {
    type: String, // Temporary download URL for the purchased file
    required: false
  },
  downloadExpiresAt: {
    type: Date,
    required: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true,
  collection: 'transactions'
});

// Indexes
transactionSchema.index({ buyerId: 1, createdAt: -1 });
transactionSchema.index({ sellerId: 1, createdAt: -1 });
transactionSchema.index({ productId: 1 });
transactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);