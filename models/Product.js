const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
  },
  category: {
    type: String,
    required: true,
    enum: ['digital_art', 'music', 'videos', 'templates', 'courses', 'software', 'other']
  },
  images: [{
    type: String, // URLs to product images
    required: false
  }],
  fileUrl: {
    type: String, // URL to the actual digital file for download
    required: false
  },
  fileType: {
    type: String,
    enum: ['pdf', 'zip', 'mp3', 'mp4', 'jpg', 'png', 'gif', 'txt', 'doc', 'other'],
    required: false
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isSold: {
    type: Boolean,
    default: false
  },
  soldAt: {
    type: Date,
    default: null
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserData',
    default: null
  },
  viewsCount: {
    type: Number,
    default: 0
  },
  likesCount: {
    type: Number,
    default: 0
  },
  reviewsCount: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  }
}, {
  timestamps: true,
  collection: 'products'
});

// Index for search
productSchema.index({ title: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1, createdAt: -1 });
productSchema.index({ sellerId: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);