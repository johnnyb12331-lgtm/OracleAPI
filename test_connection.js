const mongoose = require('mongoose');
require('dotenv').config();

console.log('🔍 MongoDB Connection Test\n');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/reelchatdb';

// Hide password in output
const safeUri = uri.replace(/:[^:@]*@/, ':****@');
console.log('Connection URI:', safeUri);
console.log('');

mongoose.connect(uri, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
})
  .then(() => {
    console.log('✅ MongoDB connection successful!');
    console.log('   Host:', mongoose.connection.host);
    console.log('   Database:', mongoose.connection.name);
    console.log('   Port:', mongoose.connection.port);
    console.log('');
    console.log('🎉 Your MongoDB is working correctly!');
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed!');
    console.error('   Error:', err.message);
    console.error('');
    console.error('💡 Troubleshooting steps:');
    console.error('   1. Check if MongoDB is running');
    console.error('   2. Verify credentials in .env file');
    console.error('   3. Check if firewall is blocking connection');
    console.error('   4. Review MONGODB_FIX_GUIDE.md for detailed help');
    process.exit(1);
  });
