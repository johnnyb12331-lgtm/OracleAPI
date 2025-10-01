const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:gmpq8w9t0@localhost:27017/reelchatdb?authSource=admin';

const Story = require('./models/Story');

async function fixStoryUrls() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all stories with old URL pattern
    const oldUrlPattern = /http:\/\/192\.168\.40\.197:3001/;
    const newBaseUrl = 'http://167.71.97.187';

    const stories = await Story.find({
      imageUrl: { $regex: oldUrlPattern }
    });

    console.log(`📊 Found ${stories.length} stories with old URLs`);

    if (stories.length === 0) {
      console.log('✅ No stories need updating');
      process.exit(0);
    }

    let updated = 0;
    for (const story of stories) {
      const oldUrl = story.imageUrl;
      const newUrl = oldUrl.replace(oldUrlPattern, newBaseUrl);
      
      story.imageUrl = newUrl;
      await story.save();
      
      updated++;
      console.log(`✅ Updated story ${story._id}: ${oldUrl} -> ${newUrl}`);
    }

    console.log(`\n🎉 Successfully updated ${updated} stories`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixStoryUrls();
