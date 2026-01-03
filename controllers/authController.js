const jwt = require('jsonwebtoken');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

class AuthController {
  // Generate JWT token
  ///generateToken(userId) {
    //return jwt.sign({ userId }, process.env.JWT_SECRET, {
      //expiresIn: process.env.JWT_EXPIRE
    //});
  //}

  

  // User registration
  async register(req, res) {
    try {
      const { username, email, password, role, bio } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'User with this email or username already exists'
        });
      }

      // Only admins can create other admins
      const userRole = req.user && req.user.role === 'admin' ? role : 'author';

      const user = new User({
        username,
        email,
        password,
        role: userRole,
        bio
      });

      await user.save();

      const token = user.generateToken();

      // Set HTTP-only cookie with the token
      res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'development', // Use HTTPS in production
        sameSite: process.env.NODE_ENV === 'development' ? 'none' : 'strict', // Allow cross-origin in production
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(201).json({
        success: true,
        data: {
          user
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create user'
      });
    }
  }

  // User login
  // User login - FIXED VERSION
// User login - FIXED VERSION
async login(req, res) {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    // Verify password
    console.log('Verifying password...');
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    console.log('Password valid, generating token...');

    // Use the User model's generateToken method OR generate directly
    let token;
    try {
      // Try using the model method first
      token = user.generateToken();
    } catch (modelError) {
      console.log('Model token method failed, using direct method');
      // Fallback: generate token directly
      token = jwt.sign(
        { 
          userId: user._id.toString(),
          email: user.email,
          role: user.role 
        },
        process.env.JWT_SECRET || 'fallback-secret-key-for-development',
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
      );
    }

    console.log('Token generated successfully');

    // Set HTTP-only cookie with the token
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use HTTPS in production
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', // Allow cross-origin in production
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user info without password
    const userResponse = user.toJSON ? user.toJSON() : {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      bio: user.bio
    };

    res.json({
      success: true,
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Login error details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login: ' + error.message
    });
  }
}

// Create admin user (for development)
async createAdmin(req, res) {
  try {
    console.log('Creating admin user...');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@trendblog.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      return res.json({
        success: true,
        message: 'Admin user already exists',
        data: {
          user: existingAdmin.toJSON ? existingAdmin.toJSON() : {
            id: existingAdmin._id,
            username: existingAdmin.username,
            email: existingAdmin.email,
            role: existingAdmin.role
          }
        }
      });
    }

    // Create admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@trendblog.com',
      password: 'admin123', // Will be hashed by pre-save hook
      role: 'admin',
      bio: 'System Administrator'
    });

    await adminUser.save();
    console.log('Admin user created successfully');

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        user: {
          id: adminUser._id,
          username: adminUser.username,
          email: adminUser.email,
          role: adminUser.role,
          bio: adminUser.bio
        }
      }
    });

  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create admin user: ' + error.message
    });
  }
}

  // Get current user
  async getCurrentUser(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      const user = req.user;
      const userData = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio
      };

      res.json({
        success: true,
        data: userData
      });
    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user data'
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const { username, email, bio, avatar } = req.body;

      // Check if username or email already exists (excluding current user)
      const existingUser = await User.findOne({
        $and: [
          { _id: { $ne: req.user._id } },
          { $or: [{ email }, { username }] }
        ]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Username or email already exists'
        });
      }

      const updateData = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (bio !== undefined) updateData.bio = bio;
      if (avatar) updateData.avatar = avatar;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        updateData,
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  }

  // Change password
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user._id);
      
      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: 'Password updated successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change password'
      });
    }
  }

  // Logout - clear HTTP-only cookie
  async logout(req, res) {
    try {
      // Clear the auth token cookie
      res.clearCookie('authToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      });

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to logout'
      });
    }
  }
}

module.exports = new AuthController();
