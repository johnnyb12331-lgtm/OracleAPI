const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authguard = require('../guard/authguard');

router.get('/', authguard, notificationController.getNotifications);
router.put('/read', authguard, notificationController.markAsRead);
router.delete('/:notificationId', authguard, notificationController.deleteNotification);
router.get('/unread-count', authguard, notificationController.getUnreadCount);
router.post('/register-device', authguard, notificationController.registerDevice);
router.get('/settings', authguard, notificationController.getNotificationSettings);
router.put('/settings', authguard, notificationController.updateNotificationSettings);

module.exports = router;