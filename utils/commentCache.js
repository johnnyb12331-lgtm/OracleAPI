const NodeCache = require('node-cache');

// Cache for user data with 10 minute TTL
const userCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Cache for post existence checks with 5 minute TTL
const postCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Cache for comment counts with 2 minute TTL
const countCache = new NodeCache({ stdTTL: 120, checkperiod: 30 });

// Cache for avatar URLs with 30 minute TTL (avatars change less frequently)
const avatarCache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });

// Cache for frequently accessed posts with 15 minute TTL
const frequentPostsCache = new NodeCache({ stdTTL: 900, checkperiod: 180 });

// Cache for user profiles with 20 minute TTL
const profileCache = new NodeCache({ stdTTL: 1200, checkperiod: 240 });

// Cache for post metadata (likes, comments counts) with 5 minute TTL
const postMetadataCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

class CommentCache {
  // User data methods
  static getUserData(userId) {
    return userCache.get(`user_${userId}`);
  }

  static setUserData(userId, userData) {
    userCache.set(`user_${userId}`, userData);
  }

  static invalidateUserData(userId) {
    userCache.del(`user_${userId}`);
    // Also invalidate related caches
    this.invalidateUserProfile(userId);
    this.invalidateUserAvatar(userId);
  }

  // Post methods
  static getPostExists(postId) {
    return postCache.get(`post_${postId}`);
  }

  static setPostExists(postId, exists) {
    postCache.set(`post_${postId}`, exists);
  }

  static getPostMetadata(postId) {
    return postMetadataCache.get(`metadata_${postId}`);
  }

  static setPostMetadata(postId, metadata) {
    postMetadataCache.set(`metadata_${postId}`, metadata);
  }

  static invalidatePostMetadata(postId) {
    postMetadataCache.del(`metadata_${postId}`);
  }

  // Avatar methods
  static getAvatarUrl(userId) {
    return avatarCache.get(`avatar_${userId}`);
  }

  static setAvatarUrl(userId, avatarUrl) {
    avatarCache.set(`avatar_${userId}`, avatarUrl);
  }

  static invalidateUserAvatar(userId) {
    avatarCache.del(`avatar_${userId}`);
  }

  // Profile methods
  static getUserProfile(userId) {
    return profileCache.get(`profile_${userId}`);
  }

  static setUserProfile(userId, profileData) {
    profileCache.set(`profile_${userId}`, profileData);
  }

  static invalidateUserProfile(userId) {
    profileCache.del(`profile_${userId}`);
  }

  // Frequent posts methods
  static getFrequentPosts(page = 1, limit = 10) {
    const key = `frequent_posts_${page}_${limit}`;
    return frequentPostsCache.get(key);
  }

  static setFrequentPosts(page = 1, limit = 10, posts) {
    const key = `frequent_posts_${page}_${limit}`;
    frequentPostsCache.set(key, posts);
  }

  static invalidateFrequentPosts() {
    // Clear all frequent posts cache entries
    const keys = frequentPostsCache.keys();
    keys.forEach(key => {
      if (key.startsWith('frequent_posts_')) {
        frequentPostsCache.del(key);
      }
    });
  }

  // Comment methods
  static getCommentCount(postId) {
    return countCache.get(`count_${postId}`);
  }

  static setCommentCount(postId, count) {
    countCache.set(`count_${postId}`, count);
  }

  static invalidatePostCount(postId) {
    countCache.del(`count_${postId}`);
  }

  // Bulk invalidation methods
  static invalidatePostData(postId) {
    this.invalidatePostMetadata(postId);
    this.invalidatePostCount(postId);
    postCache.del(`post_${postId}`);
    // Invalidate from frequent posts cache
    this.invalidateFrequentPosts();
  }

  static invalidateUserAllData(userId) {
    this.invalidateUserData(userId);
    this.invalidateUserProfile(userId);
    this.invalidateUserAvatar(userId);
    // Note: User's posts would need to be invalidated separately
  }

  // Cache statistics
  static getStats() {
    return {
      userCache: userCache.getStats(),
      postCache: postCache.getStats(),
      countCache: countCache.getStats(),
      avatarCache: avatarCache.getStats(),
      frequentPostsCache: frequentPostsCache.getStats(),
      profileCache: profileCache.getStats(),
      postMetadataCache: postMetadataCache.getStats(),
    };
  }

  // Cache management
  static clearAll() {
    userCache.flushAll();
    postCache.flushAll();
    countCache.flushAll();
    avatarCache.flushAll();
    frequentPostsCache.flushAll();
    profileCache.flushAll();
    postMetadataCache.flushAll();
  }

  // Get cache keys for monitoring
  static getCacheKeys() {
    return {
      userCache: userCache.keys(),
      postCache: postCache.keys(),
      countCache: countCache.keys(),
      avatarCache: avatarCache.keys(),
      frequentPostsCache: frequentPostsCache.keys(),
      profileCache: profileCache.keys(),
      postMetadataCache: postMetadataCache.keys(),
    };
  }

  // Memory management - flush expired entries
  static flushExpired() {
    userCache.flushAll();
    postCache.flushAll();
    countCache.flushAll();
    avatarCache.flushAll();
    frequentPostsCache.flushAll();
    profileCache.flushAll();
    postMetadataCache.flushAll();
  }
}

module.exports = CommentCache;