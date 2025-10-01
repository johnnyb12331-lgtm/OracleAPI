const Message = require('../models/Message');
const mongoose = require('mongoose');

function saveMessageToDB(message, callback) {
  const { sender_id, receiver_id, text, type, media_url } = message;

  const newMessage = new Message({
    sender_id: new mongoose.Types.ObjectId(sender_id),
    receiver_id: new mongoose.Types.ObjectId(receiver_id),
    text,
    type: type || 'text',
    media_url,
    sent_at: new Date()
  });

  newMessage.save()
    .then(result => {
      console.log('✅ Message saved to MongoDB:', result._id);
      callback(null, result);
    })
    .catch(err => {
      console.error('❌ MongoDB Error:', err);
      callback(err);
    });
}

async function sendMessage(messageData) {
  return new Promise((resolve, reject) => {
    try {
      console.log('💾 Saving message:', messageData);
      
      const { senderId, receiverId, text, replyTo } = messageData;
      
      const message = {
        sender_id: senderId,
        receiver_id: receiverId,
        text: text,
        type: 'text',
        sent_at: new Date()
      };

      saveMessageToDB(message, (err, result) => {
        if (err) {
          console.error('❌ Error saving message:', err);
          reject(err);
        } else {
          // Return message in the format expected by frontend
          const responseMessage = {
            id: result._id.toString(),
            senderId: result.sender_id.toString(),
            receiverId: result.receiver_id.toString(),
            text: result.text,
            time: result.sent_at,
            status: 'delivered',
            replyTo: replyTo
          };
          console.log('✅ Message processed:', responseMessage);
          resolve(responseMessage);
        }
      });
    } catch (error) {
      console.error('❌ Error in sendMessage:', error);
      reject(error);
    }
  });
}

module.exports = { saveMessageToDB, sendMessage };
