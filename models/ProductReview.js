const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    required: false,
    maxlength: 1000
  },
  isVerified: {
    type: Boolean,
    default: true // Verified purchase
  },
  helpful: {
    type: Number,
    default: 0
  },
  reported: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'product_reviews'
});

// Indexes
productReviewSchema.index({ productId: 1, createdAt: -1 });
productReviewSchema.index({ reviewerId: 1, createdAt: -1 });
productReviewSchema.index({ transactionId: 1 }, { unique: true }); // One review per transaction

module.exports = mongoose.model('ProductReview', productReviewSchema);