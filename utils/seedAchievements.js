const Achievement = require('../models/Achievement');

const seedAchievements = async () => {
  try {
    const achievements = [
      // Streak achievements
      {
        name: 'first_streak',
        displayName: 'Getting Started',
        description: 'Maintain a 3-day activity streak',
        icon: '🔥',
        category: 'streak',
        rarity: 'common',
        points: 10,
        criteria: {
          type: 'streak',
          target: { field: 'currentStreak', value: 3 }
        }
      },
      {
        name: 'week_warrior',
        displayName: 'Week Warrior',
        description: 'Maintain a 7-day activity streak',
        icon: '⚔️',
        category: 'streak',
        rarity: 'uncommon',
        points: 25,
        criteria: {
          type: 'streak',
          target: { field: 'currentStreak', value: 7 }
        }
      },
      {
        name: 'month_master',
        displayName: 'Month Master',
        description: 'Maintain a 30-day activity streak',
        icon: '👑',
        category: 'streak',
        rarity: 'epic',
        points: 100,
        criteria: {
          type: 'streak',
          target: { field: 'currentStreak', value: 30 }
        }
      },
      {
        name: 'legendary_streak',
        displayName: 'Legendary Streak',
        description: 'Maintain a 100-day activity streak',
        icon: '🌟',
        category: 'streak',
        rarity: 'legendary',
        points: 500,
        criteria: {
          type: 'streak',
          target: { field: 'currentStreak', value: 100 }
        }
      },

      // Engagement achievements
      {
        name: 'social_butterfly',
        displayName: 'Social Butterfly',
        description: 'Send 50 messages',
        icon: '🦋',
        category: 'social',
        rarity: 'common',
        points: 15,
        criteria: {
          type: 'count',
          target: { field: 'messages', value: 50 }
        }
      },
      {
        name: 'content_creator',
        displayName: 'Content Creator',
        description: 'Create 10 posts',
        icon: '📝',
        category: 'content',
        rarity: 'common',
        points: 20,
        criteria: {
          type: 'count',
          target: { field: 'posts', value: 10 }
        }
      },
      {
        name: 'influencer',
        displayName: 'Influencer',
        description: 'Create 100 posts',
        icon: '📸',
        category: 'content',
        rarity: 'rare',
        points: 75,
        criteria: {
          type: 'count',
          target: { field: 'posts', value: 100 }
        }
      },

      // Milestone achievements
      {
        name: 'dedicated_user',
        displayName: 'Dedicated User',
        description: 'Be active for 30 days',
        icon: '🎯',
        category: 'milestone',
        rarity: 'uncommon',
        points: 30,
        criteria: {
          type: 'count',
          target: { field: 'totalActiveDays', value: 30 }
        }
      },
      {
        name: 'loyal_member',
        displayName: 'Loyal Member',
        description: 'Be active for 365 days',
        icon: '💎',
        category: 'milestone',
        rarity: 'legendary',
        points: 1000,
        criteria: {
          type: 'count',
          target: { field: 'totalActiveDays', value: 365 }
        }
      }
    ];

    for (const achievementData of achievements) {
      const existing = await Achievement.findOne({ name: achievementData.name });
      if (!existing) {
        const achievement = new Achievement(achievementData);
        await achievement.save();
        console.log(`Created achievement: ${achievementData.displayName}`);
      }
    }

    console.log('Achievement seeding completed');
  } catch (error) {
    console.error('Error seeding achievements:', error);
  }
};

module.exports = { seedAchievements };