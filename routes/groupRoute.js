const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const authguard = require('../guard/authguard');
const multer = require('multer');

// Validation middleware
const validateGroupCreation = (req, res, next) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Group name is required'
    });
  }
  if (name.trim().length > 100) {
    return res.status(400).json({
      status: 'error',
      message: 'Group name must be less than 100 characters'
    });
  }
  next();
};

const validateObjectId = (req, res, next) => {
  const { groupId, userId } = req.params;
  const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

  if (groupId && !isValidObjectId(groupId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid group ID format' });
  }
  if (userId && !isValidObjectId(userId)) {
    return res.status(400).json({ status: 'error', message: 'Invalid user ID format' });
  }
  next();
};

const validateMemberOperation = (req, res, next) => {
  const { userId } = req.body;
  const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

  if (!userId || !isValidObjectId(userId)) {
    return res.status(400).json({
      status: 'error',
      message: 'Valid user ID is required'
    });
  }
  next();
};

const validateRoleUpdate = (req, res, next) => {
  const { role } = req.body;
  if (!role || !['admin', 'member'].includes(role)) {
    return res.status(400).json({
      status: 'error',
      message: 'Role must be either "admin" or "member"'
    });
  }
  next();
};

// Multer configuration for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml', 
      'image/avif', 'image/heic', 'image/heif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${allowedTypes.join(', ')} are allowed.`), false);
    }
  }
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ status: 'error', message: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ status: 'error', message: `Upload error: ${error.message}` });
  } else if (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }
  next();
};

// Routes

// POST routes
router.post('/',
  authguard,
  validateGroupCreation,
  groupController.createGroup
);

router.post('/:groupId/members',
  authguard,
  validateObjectId,
  validateMemberOperation,
  groupController.addMember
);

// GET routes
router.get('/',
  authguard,
  groupController.getUserGroups
);

router.get('/:groupId',
  authguard,
  validateObjectId,
  groupController.getGroup
);

// PUT routes
router.put('/:groupId',
  authguard,
  validateObjectId,
  upload.single('avatar'),
  handleMulterError,
  groupController.updateGroup
);

router.put('/:groupId/members/:userId/role',
  authguard,
  validateObjectId,
  validateRoleUpdate,
  groupController.updateMemberRole
);

// DELETE routes
router.delete('/:groupId',
  authguard,
  validateObjectId,
  groupController.deleteGroup
);

router.delete('/:groupId/members/:userId',
  authguard,
  validateObjectId,
  groupController.removeMember
);

module.exports = router;