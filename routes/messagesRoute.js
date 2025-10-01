const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messagesController');

router.post('/messages/send', messageController.sendMessage);
router.post('/messages/:id/deliver', messageController.markAsDelivered);
router.post('/messages/:id/read', messageController.markAsRead);
router.get('/messages', messageController.getMessages);
router.get('/messages/all', messageController.getAllMessages);
router.post('/messages/:id/delete', messageController.deleteMessage);
router.post('/messages/clear-all', messageController.clearAllChats);
router.get('/messages/chatlist', messageController.getChatList);
router.get('/messages/unread-count', messageController.getUnreadCount);
router.post('/messages/share', messageController.sharePostToMessage);


module.exports = router;