const Group = require('../models/Group');
const User = require('../models/User');
const UserData = require('../models/UserData');
const { createNotification } = require('./notificationController');
const mongoose = require('mongoose');
const { optimizeImage, validateImage, handleDataUrlImage } = require('../utils/imageOptimizer');
const { baseUrl } = require('../config/baseUrl');

// Create a new group
const createGroup = async (req, res) => {
  try {
    const { name, description, type, isPrivate, avatar } = req.body;
    const userId = req.user.userId;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: 'Group name is required' });
    }

    // Create the group
    const group = new Group({
      name: name.trim(),
      description: description?.trim() || '',
      type: type || 'group',
      avatar: avatar || '',
      created_by: userId,
      participants: [{
        user: userId,
        role: 'admin',
        joined_at: new Date()
      }],
      is_private: isPrivate !== undefined ? isPrivate : true
    });

    await group.save();

    // Populate creator info
    await group.populate('created_by', 'email');
    await group.populate('participants.user', 'email');

    // Normalize avatar URL in response (only if stored as filename)
    const responseGroup = group.toObject();
    if (responseGroup.avatar && !responseGroup.avatar.startsWith('http') && !responseGroup.avatar.startsWith('data:')) {
      responseGroup.avatar = `${baseUrl}/uploads/${responseGroup.avatar}`;
    }

    res.status(201).json({
      status: 'success',
      message: 'Group created successfully',
      group: responseGroup
    });

  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create group' });
  }
};

// Get user's groups
const getUserGroups = async (req, res) => {
  try {
    const userId = req.user.userId;

    const groups = await Group.find({
      'participants.user': userId
    })
    .populate('created_by', 'email')
    .populate('participants.user', 'email')
    .sort({ updated_at: -1 });

    // Get message data for each group
    const Message = require('../models/Message');
    const groupsWithMessageData = await Promise.all(
      groups.map(async (group) => {
        // Get last message
        const lastMessage = await Message.findOne({ group_id: group._id })
          .populate('sender_id', 'email')
          .sort({ sent_at: -1 })
          .limit(1);

        // Count unread messages
        const unreadCount = await Message.countDocuments({
          group_id: group._id,
          sender_id: { $ne: userId },
          is_read: false
        });

        const groupObj = group.toObject();
        groupObj.unread_count = unreadCount;
        groupObj.last_message = lastMessage ? lastMessage.text : null;
        groupObj.last_message_time = lastMessage ? lastMessage.sent_at : null;

        return groupObj;
      })
    );

    // Map avatar filenames to full URLs
    const mappedGroups = groupsWithMessageData.map(g => {
      if (g.avatar && !g.avatar.startsWith('http') && !g.avatar.startsWith('data:')) {
        g.avatar = `${baseUrl}/uploads/${g.avatar}`;
      }
      return g;
    });

    res.json({
      status: 'success',
      groups: mappedGroups
    });

  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch groups' });
  }
};

// Get group details
const getGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    const group = await Group.findById(groupId)
      .populate('created_by', 'email')
      .populate('participants.user', 'email');

    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    // Check if user is a participant
    const isParticipant = group.participants.some(p => p.user._id.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }

    const responseGroup = group.toObject();
    if (responseGroup.avatar && !responseGroup.avatar.startsWith('http') && !responseGroup.avatar.startsWith('data:')) {
      responseGroup.avatar = `${baseUrl}/uploads/${responseGroup.avatar}`;
    }
    res.json({
      status: 'success',
      group: responseGroup
    });

  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch group' });
  }
};

// Update group
const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description, avatar, isPrivate } = req.body;
    const userId = req.user.userId;

    console.log('🔄 Update group request:', { groupId, name, description, avatar: avatar ? 'provided' : 'not provided', isPrivate });
    console.log('📁 req.file:', req.file ? { originalname: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype } : 'null');

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    // Check if user is admin
    const participant = group.participants.find(p => p.user.toString() === userId);
    if (!participant || participant.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Only admins can update group' });
    }

    // Handle avatar upload
    let avatarPath = avatar; // Default to provided avatar URL
    if (req.file) {
      try {
        console.log(`🖼️ Processing group avatar upload: ${req.file.originalname} (${req.file.size} bytes)`);
        
        // Validate image
        validateImage(req.file.buffer, req.file.mimetype);
        
        // Optimize image
        // Store group avatars in a dedicated subfolder for organization
        avatarPath = await optimizeImage(
          req.file.buffer,
          `group_${req.file.originalname}`,
          'uploads/group_avatars'
        );
        
        console.log(`✅ Group avatar optimized and saved: ${avatarPath}`);
      } catch (mediaError) {
        console.error('❌ Avatar processing failed:', mediaError);
        return res.status(400).json({ 
          status: 'error', 
          message: mediaError.message || 'Failed to process avatar' 
        });
      }
    } else if (avatar && typeof avatar === 'string' && avatar.startsWith('data:image/')) {
      try {
        console.log(`🖼️ Processing data URL avatar`);
        
        // Handle data URL image
        avatarPath = await handleDataUrlImage(
          avatar,
          `group_avatar_${Date.now()}.png`,
          'uploads/group_avatars'
        );
        
        console.log(`✅ Data URL avatar processed and saved: ${avatarPath}`);
      } catch (imageError) {
        console.error('❌ Data URL avatar processing failed:', imageError);
        return res.status(400).json({ 
          status: 'error', 
          message: imageError.message || 'Failed to process data URL avatar' 
        });
      }
    }

    // Update fields
    if (name !== undefined) group.name = name.trim();
    if (description !== undefined) group.description = description.trim();
    if (avatarPath !== undefined) group.avatar = avatarPath;
    if (isPrivate !== undefined) group.is_private = isPrivate;

    group.updated_at = new Date();
    await group.save();

    await group.populate('created_by', 'email');
    await group.populate('participants.user', 'email');

    const responseGroup = group.toObject();
    if (responseGroup.avatar && !responseGroup.avatar.startsWith('http') && !responseGroup.avatar.startsWith('data:')) {
      // If stored inside group_avatars subfolder, include that path
      if (!responseGroup.avatar.includes('group_avatars')) {
        responseGroup.avatar = `${baseUrl}/uploads/${responseGroup.avatar}`;
      } else {
        responseGroup.avatar = `${baseUrl}/uploads/group_avatars/${responseGroup.avatar}`.replace('/uploads/group_avatars/uploads/group_avatars', '/uploads/group_avatars');
      }
    }
    res.json({
      status: 'success',
      message: 'Group updated successfully',
      group: responseGroup
    });

  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update group' });
  }
};

// Delete group
const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    // Check if user is the creator
    if (group.created_by.toString() !== userId) {
      return res.status(403).json({ status: 'error', message: 'Only group creator can delete group' });
    }

    await Group.findByIdAndDelete(groupId);

    res.json({
      status: 'success',
      message: 'Group deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ status: 'error', message: 'Failed to delete group' });
  }
};

// Add member to group
const addMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId: memberId } = req.body;
    const adminId = req.user.userId;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    // Check if admin
    const admin = group.participants.find(p => p.user.toString() === adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Only admins can add members' });
    }

    // Check if user exists
    const user = await User.findById(memberId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Check if already a member
    const isMember = group.participants.some(p => p.user.toString() === memberId);
    if (isMember) {
      return res.status(400).json({ status: 'error', message: 'User is already a member' });
    }

    // Add member
    group.participants.push({
      user: memberId,
      role: 'member',
      joined_at: new Date()
    });

    group.updated_at = new Date();
    await group.save();

    await group.populate('created_by', 'email');
    await group.populate('participants.user', 'email');

    // Create notification
    await createNotification(memberId, 'group_invitation', `You were added to group "${group.name}"`, { groupId: group._id });

    res.json({
      status: 'success',
      message: 'Member added successfully',
      group
    });

  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add member' });
  }
};

// Remove member from group
const removeMember = async (req, res) => {
  try {
    const { groupId, userId: memberId } = req.params;
    const adminId = req.user.userId;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    // Check if admin or removing self
    const admin = group.participants.find(p => p.user.toString() === adminId);
    const isAdmin = admin && admin.role === 'admin';
    const isSelfRemoval = adminId === memberId;

    if (!isAdmin && !isSelfRemoval) {
      return res.status(403).json({ status: 'error', message: 'Permission denied' });
    }

    // Can't remove the creator
    if (memberId === group.created_by.toString()) {
      return res.status(400).json({ status: 'error', message: 'Cannot remove group creator' });
    }

    // Remove member
    group.participants = group.participants.filter(p => p.user.toString() !== memberId);
    group.updated_at = new Date();
    await group.save();

    await group.populate('created_by', 'email');
    await group.populate('participants.user', 'email');

    res.json({
      status: 'success',
      message: 'Member removed successfully',
      group
    });

  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ status: 'error', message: 'Failed to remove member' });
  }
};

// Update member role
const updateMemberRole = async (req, res) => {
  try {
    const { groupId, userId: memberId } = req.params;
    const { role } = req.body;
    const adminId = req.user.userId;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ status: 'error', message: 'Invalid role' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    // Check if admin
    const admin = group.participants.find(p => p.user.toString() === adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Only admins can change roles' });
    }

    // Can't change creator's role
    if (memberId === group.created_by.toString()) {
      return res.status(400).json({ status: 'error', message: 'Cannot change creator role' });
    }

    // Update role
    const member = group.participants.find(p => p.user.toString() === memberId);
    if (!member) {
      return res.status(404).json({ status: 'error', message: 'Member not found in group' });
    }

    member.role = role;
    group.updated_at = new Date();
    await group.save();

    await group.populate('created_by', 'email');
    await group.populate('participants.user', 'email');

    res.json({
      status: 'success',
      message: 'Member role updated successfully',
      group
    });

  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update member role' });
  }
};

module.exports = {
  createGroup,
  getUserGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  updateMemberRole
};