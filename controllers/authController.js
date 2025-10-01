const User = require('../models/User');
const UserData = require('../models/UserData');
const RefreshToken = require('../models/RefreshToken');
const bcrypt = require('bcrypt');
const authguard = require('../utils/guardtoken');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { sendPasswordResetEmail } = require('../services/emailService');

const Login = async (req, res) => {
  const { email, password } = req.body;

  console.log(`[Login] Attempt for email: ${email} - authController.js:9`);

  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.warn('[Login] Invalid email or password for: - authController.js:16', email);
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn('[Login] Password mismatch for: - authController.js:23', email);
      return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
    }

    // Check for existing refresh tokens and delete them
    await RefreshToken.deleteMany({ user_id: user._id });

    // Create tokens
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + authguard.REFRESH_TOKEN_LIFETIME_DAYS);

    const accessToken = authguard.generateAccessToken(user._id);
    const refreshToken = authguard.generateRefreshToken(user._id);

    // Save new refresh token
    const newRefreshToken = new RefreshToken({
      token: refreshToken,
      user_id: user._id,
      expires_at: expiryDate
    });
    await newRefreshToken.save();

    // Check if profile is complete
    const userProfile = await UserData.findOne({ userId: user._id });
    const isProfileComplete = !!userProfile;

    console.log(`[Login] Login successful for user: ${user.email}, Profile Complete: ${isProfileComplete} - authController.js:47`);
    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      accessToken,
      refreshToken,
      expiryDate: expiryDate.toISOString(),
      isProfileComplete,
      userId: user._id
    });

  } catch (err) {
    console.error('[Login] Database error: - authController.js:57', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};


const Register = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ status: 'error', message: 'Email is required and cannot be empty' });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ status: 'error', message: 'Password is required and cannot be empty' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ status: 'error', message: 'Email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user
    const newUser = new User({
      email,
      password: hashedPassword,
      created_at: new Date()
    });

    const savedUser = await newUser.save();

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      userId: savedUser._id,
    });

  } catch (err) {
    console.error('[Register] Database error:', err);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  }
};



const Logout = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    if (!decoded?.userId) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const userId = decoded.userId;

    // Delete the refresh token from database
    const result = await RefreshToken.deleteOne({
      token: refreshToken,
      user_id: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Refresh token not found or already deleted" });
    }

    return res.status(200).json({ message: "Logout successful" });

  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};


const refreshToken = (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid refresh token' });

    try {
      const userId = decoded.userId;

      // Create new token
      const newAccessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: process.env.ACCESS_TOKEN_LIFETIME,
      });

      // (Optional) Create new refresh token
      const newRefreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
        expiresIn: process.env.REFRESH_TOKEN_LIFETIME,
      });

       const expiresInMs = authguard.parseDurationToMs(process.env.ACCESS_TOKEN_LIFETIME);
      const expiryDate = new Date(Date.now() + expiresInMs).toISOString();

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken, // Send new token if created
        expiryDate,
      });
    } catch (error) {
      console.error('Error refreshing token:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
};

//expiryDate: new Date(Date.now() + expiryDate),



const ForgotPassword = async (req, res) => {
  const { email } = req.body;

  console.log(`[ForgotPassword] Request for email: ${email} - authController.js`);

  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.warn('[ForgotPassword] User not found for email: - authController.js', email);
      // For security, don't reveal if email exists or not
      return res.status(200).json({ 
        status: 'success', 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }

    // Generate a simple reset token (in production, use JWT or crypto.randomBytes)
    const resetToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    // In a real application, you would:
    // 1. Save the reset token to the database with expiry
    // 2. Send an email with the reset link
    // For now, we'll just log it and return success

    console.log(`[ForgotPassword] Reset token generated for ${email}: ${resetToken} - authController.js`);

    // Send email with reset link
    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch (emailError) {
      console.error('[ForgotPassword] Failed to send email:', emailError);
      // Continue with success response for security (don't reveal email issues)
    }

    res.status(200).json({ 
      status: 'success', 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    });

  } catch (error) {
    console.error('[ForgotPassword] Error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'An error occurred while processing your request.' 
    });
  }
};

const getProfile = async (req, res) => {
  const { userId } = req.params;

  try {
    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user ID'
      });
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    // Find user data by userId
    const userData = await UserData.findOne({ userId: objectId });
    if (!userData) {
      return res.status(404).json({
        status: 'error',
        message: 'User profile not found'
      });
    }

    // Optionally, get user email from User model
    const user = await User.findById(objectId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        userId: userData.userId,
        name: userData.name,
        dateOfBirth: userData.dateOfBirth,
        gender: userData.gender,
        avatar: userData.avatar,
        isProfileComplete: userData.isProfileComplete,
        email: user.email
      }
    });

  } catch (error) {
    console.error('[getProfile] Error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

module.exports = {
  Login,
  Register,
  Logout,
  RefreshToken: refreshToken,
  ForgotPassword,
  getProfile
};