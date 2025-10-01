const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const ProductReview = require('../models/ProductReview');
const UserData = require('../models/UserData');
const { createNotification } = require('./notificationController');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { optimizeImage, validateImage, handleDataUrlImage } = require('../utils/imageOptimizer');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for digital products
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/zip', 'application/x-zip-compressed',
      'audio/mpeg', 'audio/mp3', 'video/mp4', 'video/avi', 'video/mov',
      'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only supported digital product files are allowed.'), false);
    }
  }
});

// Create a new product
const createProduct = async (req, res) => {
  try {
    const { title, description, price, currency, category, tags } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!title || !description || !price || !category) {
      return res.status(400).json({
        status: 'error',
        message: 'Title, description, price, and category are required'
      });
    }

    if (title.length > 100 || description.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Title must be ≤100 characters, description must be ≤1000 characters'
      });
    }

    if (price < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Price must be non-negative'
      });
    }

    // Handle file uploads
    let images = [];
    let fileUrl = null;
    let fileType = null;

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        if (file.mimetype.startsWith('image/')) {
          // Process image
          validateImage(file.buffer, file.mimetype);
          const optimizedImagePath = await optimizeImage(
            file.buffer,
            file.originalname,
            'uploads/marketplace'
          );
          images.push(`marketplace/${optimizedImagePath}`);
        } else {
          // Process digital product file
          const fileExtension = path.extname(file.originalname).toLowerCase();
          const fileName = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
          const filePath = path.join('uploads/marketplace/products', fileName);

          // Save file to disk (implement file saving logic)
          // For now, just set the URL
          fileUrl = `/uploads/marketplace/products/${fileName}`;
          fileType = getFileTypeFromMime(file.mimetype);
        }
      }
    }

    // Create product
    const product = new Product({
      sellerId: userId,
      title: title.trim(),
      description: description.trim(),
      price: parseFloat(price),
      currency: currency || 'USD',
      category,
      images,
      fileUrl,
      fileType,
      tags: (() => {
        if (!tags) return [];
        if (typeof tags === 'string') {
          return tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }
        if (Array.isArray(tags)) {
          return tags.map(tag => tag.toString().trim()).filter(tag => tag.length > 0);
        }
        return [];
      })()
    });

    await product.save();

    console.log(`✅ Product created: ${product._id} by user: ${userId}`);

    res.status(201).json({
      status: 'success',
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('❌ Product creation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create product',
      error: error.message
    });
  }
};

// Get all products with pagination and filters
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      sellerId
    } = req.query;

    const query = { isActive: true };

    // Add filters
    if (category) query.category = category;
    if (sellerId) query.sellerId = sellerId;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    if (search) {
      query.$text = { $search: search };
    }

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .populate('sellerId', 'name avatar')
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await Product.countDocuments(query);

    res.json({
      status: 'success',
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('❌ Get products error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};

// Get single product by ID
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id)
      .populate('sellerId', 'username profilePicture bio')
      .lean();

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    // Increment view count
    await Product.findByIdAndUpdate(id, { $inc: { viewsCount: 1 } });

    res.json({
      status: 'success',
      data: product
    });

  } catch (error) {
    console.error('❌ Get product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch product',
      error: error.message
    });
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    if (product.sellerId.toString() !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only update your own products'
      });
    }

    if (product.isSold) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot update a sold product'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['title', 'description', 'price', 'currency', 'category', 'tags', 'images'];
    const updateData = {};

    for (const field of allowedUpdates) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

    res.json({
      status: 'success',
      message: 'Product updated successfully',
      data: updatedProduct
    });

  } catch (error) {
    console.error('❌ Update product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update product',
      error: error.message
    });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    if (product.sellerId.toString() !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only delete your own products'
      });
    }

    if (product.isSold) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete a sold product'
      });
    }

    await Product.findByIdAndUpdate(id, { isActive: false });

    res.json({
      status: 'success',
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

// Purchase product
const purchaseProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body;
    const buyerId = req.user.userId;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    if (!product.isActive || product.isSold) {
      return res.status(400).json({
        status: 'error',
        message: 'Product is not available for purchase'
      });
    }

    if (product.sellerId.toString() === buyerId) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot purchase your own product'
      });
    }

    // Create transaction
    const transaction = new Transaction({
      productId: id,
      buyerId,
      sellerId: product.sellerId,
      amount: product.price,
      currency: product.currency,
      status: 'completed', // For now, mark as completed immediately
      paymentMethod: paymentMethod || 'in_app'
    });

    await transaction.save();

    // Update product status
    await Product.findByIdAndUpdate(id, {
      isSold: true,
      soldAt: new Date(),
      buyerId
    });

    // Create notification for seller
    await createNotification({
      userId: product.sellerId,
      type: 'marketplace_sale',
      message: `Your product "${product.title}" has been purchased!`,
      data: { productId: id, transactionId: transaction._id }
    });

    console.log(`💰 Product purchased: ${id} by user: ${buyerId}`);

    res.json({
      status: 'success',
      message: 'Purchase completed successfully',
      data: {
        transaction,
        downloadUrl: product.fileUrl // In real implementation, generate temporary download URL
      }
    });

  } catch (error) {
    console.error('❌ Purchase product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to complete purchase',
      error: error.message
    });
  }
};

// Get user's products
const getUserProducts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status = 'active' } = req.query;

    const query = { sellerId: userId };

    if (status === 'active') query.isActive = true;
    else if (status === 'sold') query.isSold = true;
    else if (status === 'inactive') query.isActive = false;

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      status: 'success',
      data: products
    });

  } catch (error) {
    console.error('❌ Get user products error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user products',
      error: error.message
    });
  }
};

// Get reviews for a product
const getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const reviews = await ProductReview.find({ productId: id })
      .populate('reviewerId', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await ProductReview.countDocuments({ productId: id });

    res.json({
      status: 'success',
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('❌ Get product reviews error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch reviews',
      error: error.message
    });
  }
};

// Create a review for a product
const createProductReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const reviewerId = req.user.userId;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating must be between 1 and 5'
      });
    }

    if (review && review.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Review must be ≤1000 characters'
      });
    }

    // Check if user has purchased this product
    const transaction = await Transaction.findOne({
      productId: id,
      buyerId: reviewerId,
      status: 'completed'
    });

    if (!transaction) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only review products you have purchased'
      });
    }

    // Check if review already exists for this transaction
    const existingReview = await ProductReview.findOne({ transactionId: transaction._id });
    if (existingReview) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reviewed this product'
      });
    }

    // Create review
    const productReview = new ProductReview({
      productId: id,
      reviewerId,
      transactionId: transaction._id,
      rating: parseInt(rating),
      review: review?.trim()
    });

    await productReview.save();

    // Update product rating statistics
    await updateProductRatingStats(id);

    console.log(`✅ Review created for product: ${id} by user: ${reviewerId}`);

    res.status(201).json({
      status: 'success',
      message: 'Review submitted successfully',
      data: productReview
    });

  } catch (error) {
    console.error('❌ Create product review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit review',
      error: error.message
    });
  }
};

// Update a review
const updateProductReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const reviewerId = req.user.userId;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating must be between 1 and 5'
      });
    }

    if (review && review.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Review must be ≤1000 characters'
      });
    }

    const productReview = await ProductReview.findOne({
      productId: id,
      reviewerId
    });

    if (!productReview) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    productReview.rating = parseInt(rating);
    productReview.review = review?.trim();
    await productReview.save();

    // Update product rating statistics
    await updateProductRatingStats(id);

    res.json({
      status: 'success',
      message: 'Review updated successfully',
      data: productReview
    });

  } catch (error) {
    console.error('❌ Update product review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update review',
      error: error.message
    });
  }
};

// Delete a review
const deleteProductReview = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewerId = req.user.userId;

    const productReview = await ProductReview.findOneAndDelete({
      productId: id,
      reviewerId
    });

    if (!productReview) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    // Update product rating statistics
    await updateProductRatingStats(id);

    res.json({
      status: 'success',
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete product review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete review',
      error: error.message
    });
  }
};

// Helper function to update product rating statistics
const updateProductRatingStats = async (productId) => {
  try {
    const result = await ProductReview.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          reviewsCount: { $sum: 1 }
        }
      }
    ]);

    const stats = result[0] || { averageRating: 0, reviewsCount: 0 };

    await Product.findByIdAndUpdate(productId, {
      averageRating: Math.round(stats.averageRating * 10) / 10, // Round to 1 decimal
      reviewsCount: stats.reviewsCount
    });
  } catch (error) {
    console.error('❌ Update product rating stats error:', error);
  }
};

// Get user's reviews
const getUserReviews = async (req, res) => {
  try {
    const reviewerId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const reviews = await ProductReview.find({ reviewerId })
      .populate('productId', 'title images')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    const total = await ProductReview.countDocuments({ reviewerId });

    res.json({
      status: 'success',
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('❌ Get user reviews error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch reviews',
      error: error.message
    });
  }
};

// Helper function to determine file type from MIME type
const getFileTypeFromMime = (mimeType) => {
  const mimeToType = {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'video/mp4': 'mp4',
    'video/avi': 'avi',
    'video/mov': 'mov',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc'
  };

  return mimeToType[mimeType] || 'other';
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  purchaseProduct,
  getUserProducts,
  upload,
  getProductReviews,
  createProductReview,
  updateProductReview,
  deleteProductReview,
  getUserReviews
};