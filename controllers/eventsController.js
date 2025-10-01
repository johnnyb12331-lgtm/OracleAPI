const Event = require('../models/Event');
const UserData = require('../models/UserData');
const { createNotification } = require('./notificationController');
const authguard = require('../guard/authguard');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { optimizeImage, validateImage } = require('../utils/imageOptimizer');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'), false);
    }
  }
});

// Create Event
const createEvent = async (req, res) => {
  const startTime = Date.now();
  console.log(`📅 Event creation attempt started for user: ${req.user?.userId || 'unknown'}`);

  try {
    const {
      title,
      description,
      startDate,
      endDate,
      location,
      isVirtual,
      virtualLink,
      maxAttendees,
      category,
      isPublic,
      tags,
      groupId
    } = req.body;

    const userId = req.user.userId;

    // Validate groupId if provided
    let group = null;
    if (groupId) {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Invalid group ID' 
        });
      }
      
      group = await require('../models/Group').findById(groupId);
      if (!group) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Group not found' 
        });
      }
      
      // Check if user is a member of the group
      const isMember = group.participants.some(p => p.user.toString() === userId);
      if (!isMember) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'You must be a member of the group to create events' 
        });
      }
    }

    // Input validation
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Title is required and must be a non-empty string'
      });
    }

    if (title.length > 200) {
      return res.status(400).json({
        status: 'error',
        message: 'Title must be less than 200 characters'
      });
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Description is required and must be a non-empty string'
      });
    }

    if (description.length > 2000) {
      return res.status(400).json({
        status: 'error',
        message: 'Description must be less than 2000 characters'
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid date format'
      });
    }

    if (start >= end) {
      return res.status(400).json({
        status: 'error',
        message: 'End date must be after start date'
      });
    }

    if (start < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Event start date cannot be in the past'
      });
    }

    if (isVirtual && virtualLink) {
      try {
        new URL(virtualLink);
      } catch (e) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid virtual link URL'
        });
      }
    }

    if (maxAttendees && (maxAttendees < 1 || maxAttendees > 10000)) {
      return res.status(400).json({
        status: 'error',
        message: 'Max attendees must be between 1 and 10000'
      });
    }

    // Process image if provided
    let imageUrl = null;
    if (req.file) {
      try {
        const validation = validateImage(req.file.buffer);
        if (!validation.isValid) {
          return res.status(400).json({
            status: 'error',
            message: validation.error
          });
        }

        imageUrl = await optimizeImage(req.file.buffer, `event_${Date.now()}`, 'events');
      } catch (error) {
        console.error('Image processing error:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to process event image'
        });
      }
    }

    // Create event
    const eventData = {
      title: title.trim(),
      description: description.trim(),
      organizer: userId,
      groupId: groupId ? new mongoose.Types.ObjectId(groupId) : null,
      startDate: start,
      endDate: end,
      location: location ? location.trim() : null,
      isVirtual: isVirtual || false,
      virtualLink: virtualLink ? virtualLink.trim() : null,
      maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
      category: category || 'other',
      image: imageUrl,
      isPublic: isPublic !== undefined ? isPublic : true,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : []
    };

    const event = new Event(eventData);
    await event.save();

    // Populate organizer data
    await event.populate('organizer', 'username profilePicture');
    await event.populate('attendees.user', 'username profilePicture');

    console.log(`✅ Event created successfully: ${event._id} in ${Date.now() - startTime}ms`);

    res.status(201).json({
      status: 'success',
      message: 'Event created successfully',
      data: event
    });

  } catch (error) {
    console.error('Event creation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create event'
    });
  }
};

// Get Events
const getEvents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      startDate,
      endDate,
      isPublic,
      search,
      upcoming = true
    } = req.query;

    const userId = req.user.userId;
    const query = {};

    // Filter by public events or events where user is organizer or attendee
    if (isPublic !== undefined) {
      query.isPublic = isPublic === 'true';
    } else {
      query.$or = [
        { isPublic: true },
        { organizer: userId },
        { 'attendees.user': userId }
      ];
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) {
        query.startDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.startDate.$lte = new Date(endDate);
      }
    } else if (upcoming === 'true') {
      query.startDate = { $gte: new Date() };
    }

    // Search by title or description
    if (search) {
      query.$or = query.$or || [];
      query.$or.push(
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      );
    }

    query.isCancelled = false;

    const events = await Event.find(query)
      .populate('organizer', 'username profilePicture')
      .populate('attendees.user', 'username profilePicture')
      .sort({ startDate: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Event.countDocuments(query);

    res.json({
      status: 'success',
      data: events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch events'
    });
  }
};

// Get Event by ID
const getEventById = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findById(eventId)
      .populate('organizer', 'username profilePicture')
      .populate('attendees.user', 'username profilePicture');

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found'
      });
    }

    // Check if user can view this event
    if (!event.isPublic && event.organizer._id.toString() !== userId) {
      const isAttendee = event.attendees.some(attendee =>
        attendee.user._id.toString() === userId
      );

      if (!isAttendee) {
        return res.status(403).json({
          status: 'error',
          message: 'You do not have permission to view this event'
        });
      }
    }

    res.json({
      status: 'success',
      data: event
    });

  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch event'
    });
  }
};

// Update Event
const updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found'
      });
    }

    // Check if user is the organizer
    if (event.organizer.toString() !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the event organizer can update the event'
      });
    }

    // Validate date updates
    if (updates.startDate || updates.endDate) {
      const start = new Date(updates.startDate || event.startDate);
      const end = new Date(updates.endDate || event.endDate);

      if (start >= end) {
        return res.status(400).json({
          status: 'error',
          message: 'End date must be after start date'
        });
      }

      if (start < new Date() && start.getTime() !== event.startDate.getTime()) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot change start date to a past date'
        });
      }
    }

    // Process image if provided
    if (req.file) {
      try {
        const validation = validateImage(req.file.buffer);
        if (!validation.isValid) {
          return res.status(400).json({
            status: 'error',
            message: validation.error
          });
        }

        updates.image = await optimizeImage(req.file.buffer, `event_${Date.now()}`, 'events');
      } catch (error) {
        console.error('Image processing error:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to process event image'
        });
      }
    }

    // Update event
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        event[key] = updates[key];
      }
    });

    event.updatedAt = new Date();
    await event.save();

    // Populate data
    await event.populate('organizer', 'username profilePicture');
    await event.populate('attendees.user', 'username profilePicture');

    res.json({
      status: 'success',
      message: 'Event updated successfully',
      data: event
    });

  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update event'
    });
  }
};

// Delete Event
const deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found'
      });
    }

    // Check if user is the organizer
    if (event.organizer.toString() !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the event organizer can delete the event'
      });
    }

    await Event.findByIdAndDelete(eventId);

    res.json({
      status: 'success',
      message: 'Event deleted successfully'
    });

  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete event'
    });
  }
};

// RSVP to Event
const rsvpEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { rsvpStatus } = req.body;
    const userId = req.user.userId;

    if (!['going', 'maybe', 'not_going'].includes(rsvpStatus)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid RSVP status'
      });
    }

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found'
      });
    }

    if (event.isCancelled) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot RSVP to a cancelled event'
      });
    }

    // Check max attendees
    if (rsvpStatus === 'going' && event.maxAttendees) {
      const goingCount = event.attendees.filter(a => a.rsvpStatus === 'going').length;
      if (goingCount >= event.maxAttendees) {
        return res.status(400).json({
          status: 'error',
          message: 'Event is at maximum capacity'
        });
      }
    }

    // Find existing RSVP
    const existingRSVPIndex = event.attendees.findIndex(
      attendee => attendee.user.toString() === userId
    );

    if (existingRSVPIndex >= 0) {
      // Update existing RSVP
      event.attendees[existingRSVPIndex].rsvpStatus = rsvpStatus;
      event.attendees[existingRSVPIndex].rsvpDate = new Date();
    } else {
      // Add new RSVP
      event.attendees.push({
        user: userId,
        rsvpStatus,
        rsvpDate: new Date()
      });
    }

    await event.save();

    // Populate data
    await event.populate('organizer', 'username profilePicture');
    await event.populate('attendees.user', 'username profilePicture');

    // Create notification for organizer if someone RSVPs going
    if (rsvpStatus === 'going' && event.organizer.toString() !== userId) {
      try {
        const userData = await UserData.findOne({ user: userId });
        if (userData) {
          await createNotification(
            event.organizer.toString(),
            'event_rsvp',
            `Someone RSVP'd to your event "${event.title}"`,
            { eventId: event._id, userId }
          );
        }
      } catch (notificationError) {
        console.error('Failed to create RSVP notification:', notificationError);
      }
    }

    res.json({
      status: 'success',
      message: `RSVP status updated to ${rsvpStatus}`,
      data: event
    });

  } catch (error) {
    console.error('RSVP event error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update RSVP status'
    });
  }
};

// Cancel Event
const cancelEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        status: 'error',
        message: 'Event not found'
      });
    }

    // Check if user is the organizer
    if (event.organizer.toString() !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the event organizer can cancel the event'
      });
    }

    if (event.isCancelled) {
      return res.status(400).json({
        status: 'error',
        message: 'Event is already cancelled'
      });
    }

    event.isCancelled = true;
    event.cancelledAt = new Date();
    event.cancellationReason = reason || 'Event cancelled by organizer';
    event.updatedAt = new Date();

    await event.save();

    // Notify attendees
    const attendeeIds = event.attendees.map(attendee => attendee.user.toString());
    if (attendeeIds.length > 0) {
      try {
        for (const attendeeId of attendeeIds) {
          await createNotification(
            attendeeId,
            'event_cancelled',
            `Event "${event.title}" has been cancelled`,
            { eventId: event._id, reason: event.cancellationReason }
          );
        }
      } catch (notificationError) {
        console.error('Failed to create cancellation notifications:', notificationError);
      }
    }

    res.json({
      status: 'success',
      message: 'Event cancelled successfully',
      data: event
    });

  } catch (error) {
    console.error('Cancel event error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel event'
    });
  }
};

// Get Group Events
const getGroupEvents = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    // Validate group exists and user is a member
    const Group = require('../models/Group');
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Group not found' 
      });
    }

    const isMember = group.participants.some(p => p.user.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'You must be a member of the group to view events' 
      });
    }

    const events = await Event.find({ 
      groupId: new mongoose.Types.ObjectId(groupId),
      isCancelled: false 
    })
      .populate('organizer', 'username profilePicture')
      .populate('attendees.user', 'username profilePicture')
      .sort({ startDate: 1 })
      .lean();

    res.json({
      status: 'success',
      data: events
    });

  } catch (error) {
    console.error('Get group events error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch group events'
    });
  }
};

// Get User's Events
const getUserEvents = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.userId;
    const { type = 'all' } = req.query; // 'organized', 'attending', 'all'

    let query = {};

    if (type === 'organized') {
      query.organizer = userId;
    } else if (type === 'attending') {
      query.attendees = {
        $elemMatch: {
          user: userId,
          rsvpStatus: { $in: ['going', 'maybe'] }
        }
      };
    } else {
      query.$or = [
        { organizer: userId },
        { attendees: { $elemMatch: { user: userId } } }
      ];
    }

    query.isCancelled = false;

    const events = await Event.find(query)
      .populate('organizer', 'username profilePicture')
      .populate('attendees.user', 'username profilePicture')
      .sort({ startDate: 1 })
      .lean();

    res.json({
      status: 'success',
      data: events
    });

  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user events'
    });
  }
};

module.exports = {
  createEvent,
  getEvents,
  getGroupEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  rsvpEvent,
  cancelEvent,
  getUserEvents,
  upload
};