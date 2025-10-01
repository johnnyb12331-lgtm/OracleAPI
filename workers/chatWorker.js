const { saveMessageToDB } = require('../services/messageService');
const Redis = require('ioredis');
const mongoose = require('mongoose');

function processQueue() {
  console.log('🟢 Chat Worker started...');

  // Try to connect to Redis
  const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    connectTimeout: 5000,
    lazyConnect: true,
  });

  redis.on('connect', () => {
    console.log('✅ Chat Worker: Redis connected, processing queue...');
    startProcessing();
  });

  redis.on('error', (err) => {
    console.log('⚠️  Chat Worker: Redis not available, worker disabled');
    console.log('📝 Messages are saved directly to DB via socket handler');
    // Don't exit the process, just disable Redis functionality
  });

  function startProcessing() {
    function loop() {
      redis.brpop('chat_queue', 0, (err, msgStr) => {
        if (err) {
          console.error('❌ Redis Error:', err);
          return loop();
        }

        const message = JSON.parse(msgStr[1]);
        console.log('📩 Processing message from queue:', message);

        saveMessageToDB(message, (err, result) => {
          if (err) {
            console.error('❌ Error saving message:', err);
          } else {
            console.log('✅ Message saved to DB:', result);
          }
          loop(); // Continue processing
        });
      });
    }
    loop();
  }
}

processQueue();
