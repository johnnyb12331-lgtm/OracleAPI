const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

require('dotenv').config();

// Create HTTP server first
const server = http.createServer(app);

// Initialize Socket.IO with the server
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.IO middleware for logging
io.use((socket, next) => {
  console.log(`🔌 Socket.IO: Connection attempt from ${socket.handshake.address}:${socket.handshake.port}`);
  console.log(`🔌 Socket.IO: Headers:`, socket.handshake.headers);
  next();
});
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('./config/db');
connectDB();

// Start chat worker
require('./workers/chatWorker');

const cacheMonitor = require('./utils/cacheMonitor');

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
// Allow binding to a specific IP via BIND_IP env var. Default to 0.0.0.0 so devices/emulators can connect.
const customIP = '0.0.0.0';

// Create base URL for API responses
const baseUrl = require('./config/baseUrl');

const Redis = require('ioredis');

// Redis configuration - DISABLED for now to avoid connection errors
let redis = null;
let redisAvailable = false;

console.log('Redis disabled - Chat functionality will work without Redis');
const socketEmitter = require('./utils/socketEmitter');
socketEmitter.setIO(io);

// Configure CORS properly - only use cors() middleware to avoid duplicate headers
/*app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));*/

// Body payload limits (already set; keep as-is)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploads BEFORE other static files to ensure images are served correctly
app.use('/uploads', express.static('uploads'));

// Rate limiting and slow-down protections
const { globalApiLimiter, globalSlowDown, authLimiter, writeActionLimiter } = require('./middlewares/rateLimiters');

// Apply global slowdown & rate limiter to all API routes
app.use('/api', globalSlowDown);
app.use('/api', globalApiLimiter);

const authRoutes = require('./routes/authRoute');
const socialRoutes = require('./routes/socialRoute');
// Apply stricter limiter to authentication endpoints
app.use('/api/auth/social', authLimiter, socialRoutes);
app.use('/api/auth', authLimiter, authRoutes);

const setupProfileRoutes = require('./routes/setupprofileRoute');
app.use('/api/user', setupProfileRoutes);

const userRoutes = require('./routes/userRoute');
app.use('/api/user', userRoutes);

const messageRoutes = require('./routes/messagesRoute');
// Messages contain write operations; protect with writeActionLimiter
app.use('/api', writeActionLimiter, messageRoutes);


const chatRoutes = require('./routes/chatRoute');
app.use('/api/chat', chatRoutes);

const postsRoutes = require('./routes/postsRoute');
// Posts are write-heavy: apply writeActionLimiter
app.use('/api/posts', writeActionLimiter, postsRoutes);

const storiesRoutes = require('./routes/storiesRoute');
app.use('/api/stories', storiesRoutes);

const commentsRoutes = require('./routes/commentsRoute');
app.use('/api/comments', commentsRoutes);

const notificationRoutes = require('./routes/notificationRoute');
app.use('/api/notifications', notificationRoutes);

const callsRoutes = require('./routes/callsRoute');
app.use('/api/calls', callsRoutes);

const analyticsRoutes = require('./routes/analyticsRoute');
app.use('/api/analytics', analyticsRoutes);

const eventsRoutes = require('./routes/eventsRoute');
app.use('/api/events', eventsRoutes);

const gamificationRoutes = require('./routes/gamificationRoute');
app.use('/api/gamification', gamificationRoutes);

const marketplaceRoutes = require('./routes/marketplaceRoute');
app.use('/api/marketplace', marketplaceRoutes);

const groupRoutes = require('./routes/groupRoute');
app.use('/api/groups', groupRoutes);

const securityRoutes = require('./routes/securityRoute');
app.use('/api/security', securityRoutes);

// Serve Flutter web app static files ONLY for non-API and non-uploads routes
app.use((req, res, next) => {
  // Skip static file serving for API and uploads routes
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  express.static(path.join(__dirname, '../reeltalk/build/web'))(req, res, next);
});

// Catch all handler: serve index.html for non-API routes (for SPA routing)
app.get('*', (req, res) => {
  // Only serve index.html for non-API and non-uploads routes
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    const indexPath = path.join(__dirname, '../reeltalk/build/web/index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Flutter web build not found');
    }
  } else {
    res.status(404).json({ status: 'error', message: 'API endpoint not found' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Socket.IO: User connected: ${socket.id} from ${socket.handshake.address}`);

  // User joins their own room
  socket.on('join', (userId) => {
    if (typeof userId === 'string') {
      socket.join(userId);
      console.log(`🔌 Socket.IO: User ${userId} joined room ${userId}`);
    } else if (userId && userId.userId) {
      socket.join(userId.userId);
      console.log(`🔌 Socket.IO: User ${userId.userId} joined room ${userId.userId}`);
    } else {
      console.error('❌ Invalid userId format:', userId);
    }
  });

  // Handle sending messages
  socket.on('send_message', async (messageData) => {
    try {
      console.log('📩 Received message data:', messageData);
      
      const messageService = require('./services/messageService');
      const message = await messageService.sendMessage(messageData);
      
      console.log('💾 Message saved:', message);

      // Send to receiver's room (using userId as room name)
      const receiverId = messageData.receiverId || messageData.receiver_id;
      if (receiverId) {
        console.log(`📤 Sending message to receiver room: ${receiverId}`);
        io.to(receiverId).emit('receive_message', message);
        
        // Notify receiver about inbox update
        io.to(receiverId).emit('inbox_update', {
          type: 'new_message',
          senderId: messageData.senderId,
          message: message
        });
        
        // Notify receiver about unread count update
        io.to(receiverId).emit('inbox_unread_update', {
          userId: receiverId
        });
      }

      // Send confirmation to sender
      socket.emit('message_sent_confirmation', message);
      
      // Also notify sender about their inbox update (for last message display)
      socket.emit('inbox_update', {
        type: 'message_sent',
        receiverId: receiverId,
        message: message
      });
      
      console.log('✅ Message sent successfully');
    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('message_error', { error: error.message });
    }
  });

  // Confirm reading
  socket.on('message_read', ({ messageId, receiverId }) => {
    const receiverSocket = io.sockets.sockets.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket.id).emit('message_read_ack', messageId);
    }
  });

  // Join post room for real-time comments
  socket.on('join_post', (postId) => {
    if (typeof postId === 'string') {
      socket.join(`post_${postId}`);
      console.log(`🔌 Socket.IO: User joined post room: post_${postId}`);
    }
  });

  // Leave post room
  socket.on('leave_post', (postId) => {
    if (typeof postId === 'string') {
      socket.leave(`post_${postId}`);
      console.log(`🔌 Socket.IO: User left post room: post_${postId}`);
    }
  });

  // Video Call Signaling Events
  socket.on('start_call', async (callData) => {
    try {
      const { callerId, participants, callType, isVideo } = callData;
      const callId = `call_${Date.now()}_${callerId}`;

      // Create call record
      const Call = require('./models/Call');
      const newCall = new Call({
        callId,
        callerId,
        participants: participants.map(p => ({ userId: p })),
        callType,
        isVideo
      });
      await newCall.save();

      // Join call room
      socket.join(callId);
      console.log(`📞 Call started: ${callId} by ${callerId}`);

      // Notify participants
      participants.forEach(participantId => {
        io.to(participantId).emit('incoming_call', {
          callId,
          callerId,
          callType,
          isVideo,
          participants
        });

        // Send push notification for incoming call
        const PushNotificationService = require('./services/pushNotificationService');
        PushNotificationService.sendCallNotification(callerId, participantId, {
          callId,
          isVideo
        });
      });

      // Set timeout for missed call (30 seconds)
      setTimeout(async () => {
        try {
          const call = await Call.findOne({ callId, status: 'ringing' });
          if (call) {
            // Mark participants who haven't joined as missed
            await Call.updateMany(
              { callId },
              { 
                $set: { 
                  'participants.$[elem].status': 'missed',
                  status: 'missed'
                }
              },
              { 
                arrayFilters: [{ 'elem.status': 'invited' }],
                multi: true
              }
            );

            // Send missed call notifications
            const notificationController = require('./controllers/notificationController');
            call.participants.forEach(async (participant) => {
              if (participant.status === 'invited') {
                await notificationController.createNotification({
                  userId: participant.userId,
                  type: 'missed_call',
                  title: 'Missed Call',
                  message: `You missed a ${call.isVideo ? 'video' : 'voice'} call from ${call.callerId}`,
                  data: { callId, callerId: call.callerId }
                });

                io.to(participant.userId.toString()).emit('missed_call', {
                  callId,
                  callerId: call.callerId,
                  isVideo: call.isVideo
                });
              }
            });

            console.log(`📞 Call marked as missed: ${callId}`);
          }
        } catch (error) {
          console.error('❌ Error marking call as missed:', error);
        }
      }, 30000); // 30 seconds

      socket.emit('call_started', { callId });
    } catch (error) {
      console.error('❌ Error starting call:', error);
      socket.emit('call_error', { error: error.message });
    }
  });

  socket.on('join_call', async ({ callId, userId }) => {
    try {
      socket.join(callId);
      console.log(`📞 User ${userId} joined call: ${callId}`);

      // Update participant status
      const Call = require('./models/Call');
      await Call.updateOne(
        { callId, 'participants.userId': userId },
        { 
          $set: { 
            'participants.$.status': 'joined',
            'participants.$.joinedAt': new Date(),
            status: 'ongoing',
            startedAt: new Date()
          }
        }
      );

      // Notify others in the call
      socket.to(callId).emit('user_joined_call', { userId, callId });

      socket.emit('joined_call', { callId });
    } catch (error) {
      console.error('❌ Error joining call:', error);
      socket.emit('call_error', { error: error.message });
    }
  });

  socket.on('decline_call', async ({ callId, userId }) => {
    try {
      // Update participant status
      const Call = require('./models/Call');
      await Call.updateOne(
        { callId, 'participants.userId': userId },
        { $set: { 'participants.$.status': 'declined' } }
      );

      // Notify caller
      const call = await Call.findOne({ callId });
      io.to(call.callerId.toString()).emit('call_declined', { callId, userId });

      console.log(`📞 Call declined: ${callId} by ${userId}`);
    } catch (error) {
      console.error('❌ Error declining call:', error);
    }
  });

  socket.on('end_call', async ({ callId, userId }) => {
    try {
      const Call = require('./models/Call');
      const call = await Call.findOne({ callId });

      if (call) {
        const now = new Date();
        const duration = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0;

        await Call.updateOne(
          { callId },
          { 
            status: 'ended',
            endedAt: now,
            duration,
            $set: { 'participants.$[elem].leftAt': now, 'participants.$[elem].status': 'left' }
          },
          { arrayFilters: [{ 'elem.userId': userId }] }
        );

        // Notify all participants
        io.to(callId).emit('call_ended', { callId, endedBy: userId, duration });
        console.log(`📞 Call ended: ${callId} by ${userId}`);
      }
    } catch (error) {
      console.error('❌ Error ending call:', error);
    }
  });

  // WebRTC Signaling
  socket.on('webrtc_offer', ({ callId, offer, targetUserId }) => {
    socket.to(callId).emit('webrtc_offer', { offer, fromUserId: socket.id });
  });

  socket.on('webrtc_answer', ({ callId, answer, targetUserId }) => {
    socket.to(callId).emit('webrtc_answer', { answer, fromUserId: socket.id });
  });

  socket.on('ice_candidate', ({ callId, candidate, targetUserId }) => {
    socket.to(callId).emit('ice_candidate', { candidate, fromUserId: socket.id });
  });

  // On disconnection
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket.IO: User disconnected: ${socket.id}, reason: ${reason}`);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error(`🔌 Socket.IO: Socket error for ${socket.id}:`, error);
  });
});

// Cache monitoring endpoints
app.get('/api/cache/stats', (req, res) => {
  try {
    const stats = cacheMonitor.getCacheStatistics();
    res.json({ status: 'success', data: stats });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get cache statistics' });
  }
});

app.get('/api/cache/health', (req, res) => {
  try {
    const health = cacheMonitor.getHealthStatus();
    res.json({ status: 'success', data: health });
  } catch (error) {
    console.error('Cache health error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get cache health' });
  }
});

app.post('/api/cache/cleanup/:type', (req, res) => {
  try {
    const { type } = req.params;
    cacheMonitor.cleanupSpecificCache(type);
    res.json({ status: 'success', message: `Cache cleanup initiated for type: ${type}` });
  } catch (error) {
    console.error('Cache cleanup error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to cleanup cache' });
  }
});

server.listen(port, customIP, () => {
  const listenHost = customIP === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : customIP;
  console.log(`Server is running on http://${listenHost}:${port}`);
  // Helpful note for local development
  if (customIP === '0.0.0.0') {
    console.log(`You can connect from the host machine at http://127.0.0.1:${port}`);
    console.log(`Android emulator (default) -> use http://10.0.2.2:${port}`);
  }
});

/*server.listen(port, () => {
  console.log(Server is running on );
});*/

module.exports = { io, baseUrl };
