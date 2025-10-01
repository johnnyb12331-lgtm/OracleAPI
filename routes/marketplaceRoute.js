const express = require('express');
const router = express.Router();
const marketplaceController = require('../controllers/marketplaceController');
const authguard = require('../guard/authguard');

// Validation middleware
const validateProductCreation = (req, res, next) => {
  const { title, description, price, category } = req.body;

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

  if (isNaN(price) || parseFloat(price) < 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Price must be a valid non-negative number'
    });
  }

  next();
};

const validateObjectId = (req, res, next) => {
  const { id } = req.params;
  if (id && !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid product ID format'
    });
  }
  next();
};

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof require('multer').MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'error',
        message: 'File too large. Maximum size is 50MB.'
      });
    }
    return res.status(400).json({
      status: 'error',
      message: `Upload error: ${error.message}`
    });
  } else if (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
  next();
};

// Routes

// GET routes
router.get('/', marketplaceController.getProducts);
router.get('/products', marketplaceController.getProducts);
router.get('/my-products', authguard, marketplaceController.getUserProducts);
router.get('/:id',
  validateObjectId,
  marketplaceController.getProductById
);

// POST routes
router.post('/',
  authguard,
  marketplaceController.upload.array('files', 10), // Allow up to 10 files
  handleMulterError,
  validateProductCreation,
  marketplaceController.createProduct
);

router.post('/:id/purchase',
  authguard,
  validateObjectId,
  marketplaceController.purchaseProduct
);

// PUT routes
router.put('/:id',
  authguard,
  validateObjectId,
  marketplaceController.updateProduct
);

// DELETE routes
router.delete('/:id',
  authguard,
  validateObjectId,
  marketplaceController.deleteProduct
);

// Review routes
router.get('/:id/reviews',
  validateObjectId,
  marketplaceController.getProductReviews
);

router.post('/:id/reviews',
  authguard,
  validateObjectId,
  marketplaceController.createProductReview
);

router.put('/:id/reviews',
  authguard,
  validateObjectId,
  marketplaceController.updateProductReview
);

router.delete('/:id/reviews',
  authguard,
  validateObjectId,
  marketplaceController.deleteProductReview
);

// User reviews
router.get('/user/reviews',
  authguard,
  marketplaceController.getUserReviews
);

module.exports = router;