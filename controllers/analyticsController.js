const Post = require('../models/Post');
const Like = require('../models/Like');
const UserData = require('../models/UserData');
const mongoose = require('mongoose');

// Get user analytics data
const getUserAnalytics = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Find userData for the user
    const userData = await UserData.findOne({ userId });
    if (!userData) {
      return res.status(404).json({ status: 'error', message: 'User profile not found' });
    }

    // Get user's posts
    const posts = await Post.find({ userDataId: userData._id });

    // Calculate total posts, likes, and views
    const totalPosts = posts.length;
    const totalLikes = posts.reduce((sum, post) => sum + post.likesCount, 0);
    const totalViews = posts.reduce((sum, post) => sum + post.viewsCount, 0);

    // Get posts created in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentPosts = await Post.find({
      userDataId: userData._id,
      created_at: { $gte: thirtyDaysAgo }
    }).sort({ created_at: 1 });

    // Prepare chart data for posts over time
    const postsOverTime = recentPosts.map(post => ({
      date: post.created_at.toISOString().split('T')[0],
      count: 1
    }));

    // Aggregate likes over time
    const likesOverTime = await Like.aggregate([
      {
        $lookup: {
          from: 'posts',
          localField: 'targetId',
          foreignField: '_id',
          as: 'post'
        }
      },
      {
        $match: {
          'post.userDataId': userData._id,
          created_at: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$created_at' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Format likes over time
    const formattedLikesOverTime = likesOverTime.map(item => ({
      date: item._id,
      count: item.count
    }));

    res.json({
      status: 'success',
      data: {
        totalPosts,
        totalLikes,
        totalViews,
        postsOverTime,
        likesOverTime: formattedLikesOverTime
      }
    });

  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get analytics data' });
  }
};

// Get platform-wide analytics (for admin)
const getPlatformAnalytics = async (req, res) => {
  try {
    // Total users
    const totalUsers = await UserData.countDocuments();

    // Total posts
    const totalPosts = await Post.countDocuments();

    // Total likes
    const totalLikes = await Like.countDocuments();

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentPosts = await Post.countDocuments({ created_at: { $gte: sevenDaysAgo } });
    const recentLikes = await Like.countDocuments({ created_at: { $gte: sevenDaysAgo } });

    res.json({
      status: 'success',
      data: {
        totalUsers,
        totalPosts,
        totalLikes,
        recentPosts,
        recentLikes
      }
    });

  } catch (error) {
    console.error('Error getting platform analytics:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get platform analytics' });
  }
};

module.exports = {
  getUserAnalytics,
  getPlatformAnalytics
};