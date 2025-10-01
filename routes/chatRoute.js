
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authguard = require('../guard/authguard');
const multer = require('multer');
const path = require('path');

// Configure multer for voice message uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/voice/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for voice messages
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});
// Send message
router.post('/send', chatController.sendMessage);

// Upload voice message
router.post('/upload-voice', authguard, upload.single('voice'), chatController.uploadVoiceMessage);

// Fetch messages between users
router.get('/history', chatController.getMessages);

// Fetch inbox
router.get('/getInbox', authguard,  chatController.getInbox);

// Fetch messages of a specific conversation
router.get('/messages', chatController.getmessage);

// Mark messages as read
router.post('/markAsRead', authguard, chatController.markAsRead);

// Mark all messages as read
router.post('/markAllAsRead', authguard, chatController.markAllAsRead);

// Clear all conversations
router.post('/clearAllConversations', authguard, chatController.clearAllConversations);

// Group management routes
router.post('/groups', authguard, chatController.createGroup);
router.get('/groups', authguard, chatController.getUserGroups);
router.put('/groups', authguard, chatController.updateGroup);
router.post('/groups/addParticipant', authguard, chatController.addParticipant);
router.post('/groups/removeParticipant', authguard, chatController.removeParticipant);
router.post('/groups/changeRole', authguard, chatController.changeParticipantRole);

module.exports = router;
