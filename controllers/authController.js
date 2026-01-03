const jwt = require('jsonwebtoken');  
const User = require('../models/User');  
const Session = require('../models/Session');  
const { v4: uuidv4 } = require('uuid');  
const bcrypt = require('bcryptjs');  
  
class AuthController {  
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
  
      // Create session for new user (auto-login after registration)  
      const sessionId = `sess_${uuidv4()}_${Date.now()}`;  
      await this._createSession(sessionId, user._id, req);  
  
      // Set session cookie  
      res.cookie('session_id', sessionId, {  
        httpOnly: true,  
        secure: process.env.NODE_ENV === 'production',  
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',  
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days  
      });  
  
      res.status(201).json({  
        success: true,  
        data: {  
          user: {  
            id: user._id,  
            username: user.username,  
            email: user.email,  
            role: user.role,  
            bio: user.bio  
          }  
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
  
      console.log('Password valid, creating session...');  
  
      // Create session instead of JWT token  
      const sessionId = `sess_${uuidv4()}_${Date.now()}`;  
      await this._createSession(sessionId, user._id, req);  
  
      console.log('Session created successfully');  
  
      // Set session cookie  
      res.cookie('session_id', sessionId, {  
        httpOnly: true,  
        secure: process.env.NODE_ENV === 'production',  
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',  
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days  
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
  
  // Logout - clear session  
  async logout(req, res) {  
    try {  
      // Get session ID from cookie  
      const sessionId = req.cookies?.session_id;  
        
      if (sessionId) {  
        // Delete session from database  
        await Session.deleteOne({ sessionId });  
        console.log('Session deleted:', sessionId);  
      }  
  
      // Clear the session cookie  
      res.clearCookie('session_id', {  
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
  
  // Helper method to create session with device info  
  async _createSession(sessionId, userId, req) {  
    const deviceInfo = this._extractDeviceInfo(req);  
    const locationInfo = this._extractLocationInfo(req);  
      
    await Session.create({  
      sessionId,  
      userId,  
      ...deviceInfo,  
      ...locationInfo,  
      startTime: new Date(),  
      endTime: new Date(),  
      isActive: true  
    });  
  }  
  
  // Helper method to extract device information  
  _extractDeviceInfo(req) {  
    const userAgent = req.headers['user-agent'] || '';  
      
    // Simple device detection (you can use a library like 'ua-parser-js' for better detection)  
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);  
    const isTablet = /iPad|Tablet/.test(userAgent);  
      
    let deviceType = 'desktop';  
    if (isTablet) deviceType = 'tablet';  
    else if (isMobile) deviceType = 'mobile';  
  
    // Extract browser info (basic implementation)  
    let browser = 'Unknown';  
    let os = 'Unknown';  
      
    if (userAgent.includes('Chrome')) browser = 'Chrome';  
    else if (userAgent.includes('Firefox')) browser = 'Firefox';  
    else if (userAgent.includes('Safari')) browser = 'Safari';  
      
    if (userAgent.includes('Windows')) os = 'Windows';  
    else if (userAgent.includes('Mac')) os = 'macOS';  
    else if (userAgent.includes('Linux')) os = 'Linux';  
    else if (userAgent.includes('Android')) os = 'Android';  
    else if (userAgent.includes('iOS')) os = 'iOS';  
  
    return {  
      userAgent,  
      deviceType,  
      browser,  
      os,  
      ipAddress: req.ip || req.connection.remoteAddress,  
      referrer: req.headers.referer || 'direct'  
    };  
  }  
  
  // Helper method to extract location (basic implementation)  
  _extractLocationInfo(req) {  
    // In production, you'd use a GeoIP service  
    return {  
      country: 'Unknown',  
      countryCode: 'Unknown',  
      city: 'Unknown',  
      region: 'Unknown',  
      continent: 'Unknown'  
    };  
  }  
}  
  
module.exports = new AuthController();
