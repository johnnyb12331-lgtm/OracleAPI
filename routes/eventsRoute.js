const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');
const authguard = require('../guard/authguard');

// Create event
router.post('/', authguard, eventsController.upload.single('image'), eventsController.createEvent);

// Get events with filtering
router.get('/', authguard, eventsController.getEvents);

// Get group events
router.get('/group/:groupId', authguard, eventsController.getGroupEvents);

// Get event by ID
router.get('/:eventId', authguard, eventsController.getEventById);

// Update event
router.put('/:eventId', authguard, eventsController.upload.single('image'), eventsController.updateEvent);

// Delete event
router.delete('/:eventId', authguard, eventsController.deleteEvent);

// RSVP to event
router.post('/:eventId/rsvp', authguard, eventsController.rsvpEvent);

// Cancel event
router.post('/:eventId/cancel', authguard, eventsController.cancelEvent);

// Get user's events
router.get('/user/:userId', authguard, eventsController.getUserEvents);

module.exports = router;