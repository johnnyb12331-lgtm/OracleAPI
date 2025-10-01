const express = require('express');
const router = express.Router();
const Call = require('../models/Call');
const authMiddleware = require('../middlewares/authmw');

// Get call history for a user
router.get('/history/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const calls = await Call.find({
      $or: [
        { callerId: userId },
        { 'participants.userId': userId }
      ]
    })
    .populate('callerId', 'username profilePicture')
    .populate('participants.userId', 'username profilePicture')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Call.countDocuments({
      $or: [
        { callerId: userId },
        { 'participants.userId': userId }
      ]
    });

    res.json({
      status: 'success',
      data: {
        calls,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching call history:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch call history' });
  }
});

// Get specific call details
router.get('/:callId', authMiddleware, async (req, res) => {
  try {
    const { callId } = req.params;
    const call = await Call.findOne({ callId })
      .populate('callerId', 'username profilePicture')
      .populate('participants.userId', 'username profilePicture');

    if (!call) {
      return res.status(404).json({ status: 'error', message: 'Call not found' });
    }

    res.json({ status: 'success', data: call });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch call details' });
  }
});

// Delete call from history
router.delete('/:callId', authMiddleware, async (req, res) => {
  try {
    const { callId } = req.params;
    const { userId } = req.body;

    const call = await Call.findOne({ callId });
    if (!call) {
      return res.status(404).json({ status: 'error', message: 'Call not found' });
    }

    // Only allow deletion by caller or participants
    const isParticipant = call.callerId.toString() === userId ||
      call.participants.some(p => p.userId.toString() === userId);

    if (!isParticipant) {
      return res.status(403).json({ status: 'error', message: 'Not authorized to delete this call' });
    }

    await Call.findOneAndDelete({ callId });

    res.json({ status: 'success', message: 'Call deleted from history' });
  } catch (error) {
    console.error('Error deleting call:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete call' });
  }
});

module.exports = router;