const User = require('../models/User');
const Article = require('../models/Article');
const AdUnit = require('../models/AdUnit');
const Newsletter = require('../models/Newsletter');
const Analytics = require('../models/Analytics');

class UserController {

  // Create new user (Admin only)  
  async createUser(req, res) {  
    try {  
      const { username, email, password, role = 'author', bio, avatar } = req.body;  
  
      // Validate required fields  
      if (!username || !email || !password) {  
        return res.status(400).json({  
          success: false,  
          error: 'Username, email, and password are required'  
        });  
      }  
  
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
  
      // Create new user  
      const newUser = new User({  
        username,  
        email,  
        password, // Will be hashed by pre-save hook  
        role,  
        bio,  
        avatar,  
        isActive: true  
      });  
  
      await newUser.save();  
  
      // Remove password from response  
      const userResponse = newUser.toObject();  
      delete userResponse.password;  
  
      res.status(201).json({  
        success: true,  
        data: userResponse,  
        message: 'User created successfully'  
      });  
    } catch (error) {  
      console.error('Create user error:', error);  
      res.status(500).json({  
        success: false,  
        error: 'Failed to create user'  
      });  
    }  
  }  
  
  
  // Get all users with pagination and filtering (Admin only)
  async getAllUsers(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const role = req.query.role;
      const search = req.query.search;
      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      const skip = (page - 1) * limit;

      // Build query
      const query = {};
      
      if (role) query.role = role;
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { bio: { $regex: search, $options: 'i' } }
        ];
      }

      // Get users with pagination
      const users = await User.find(query)
        .select('-password') // Exclude password
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec();

      // Get article counts for each user
      const userIds = users.map(user => user._id);
      const articleCounts = await Article.aggregate([
        { $match: { author: { $in: userIds } } },
        {
          $group: {
            _id: '$author',
            count: { $sum: 1 }
          }
        }
      ]);

      // Create a map of user ID to article count
      const articleCountMap = {};
      articleCounts.forEach(item => {
        articleCountMap[item._id.toString()] = item.count;
      });

      // Add article count to each user
      const usersWithCounts = users.map(user => ({
        ...user.toObject(),
        articleCount: articleCountMap[user._id.toString()] || 0
      }));

      // Get total count for pagination
      const total = await User.countDocuments(query);
      const totalPages = Math.ceil(total / limit);

      // Get user statistics
      const userStats = await User.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            totalViews: { $sum: '$totalViews' },
            totalArticles: { $sum: '$articlesWritten' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          users: usersWithCounts,
          pagination: {
            current: page,
            total: totalPages,
            totalItems: total,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          statistics: userStats
        }
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch users'
      });
    }
  }

  // Get user by ID (Admin only)
  async getUserById(req, res) {
    try {
      const { id } = req.params;

      const user = await User.findById(id)
        .select('-password')
        .populate({
          path: 'recentArticles',
          options: { limit: 5, sort: { createdAt: -1 } }
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get user performance statistics
      const userStats = await Article.aggregate([
        { $match: { author: user._id } },
        {
          $group: {
            _id: '$author',
            totalArticles: { $sum: 1 },
            totalViews: { $sum: '$views' },
            totalLikes: { $sum: '$likesCount' },
            totalComments: { $sum: { $size: '$comments' } },
            averageTrendingScore: { $avg: '$trendingScore' },
            averageReadTime: { $avg: '$readTime' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          user,
          statistics: userStats[0] || {
            totalArticles: 0,
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            averageTrendingScore: 0,
            averageReadTime: 0
          }
        }
      });
    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user'
      });
    }
  }

  // Update user (Admin only)
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, email, bio, avatar, isActive } = req.body;

      // Check if username or email already exists (excluding current user)
      const existingUser = await User.findOne({
        $and: [
          { _id: { $ne: id } },
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
      if (username !== undefined) updateData.username = username;
      if (email !== undefined) updateData.email = email;
      if (bio !== undefined) updateData.bio = bio;
      if (avatar) updateData.avatar = avatar;
      if (isActive !== undefined) updateData.isActive = isActive;

      const user = await User.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user,
        message: 'User updated successfully'
      });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user'
      });
    }
  }

  // Update user role (Admin only)
  async updateUserRole(req, res) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!['admin', 'author', 'editor'].includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role. Must be admin, author, or editor'
        });
      }

      // Check if req.user exists
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Prevent changing own role
      if (id === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: 'Cannot change your own role'
        });
      }

      const user = await User.findByIdAndUpdate(
        id,
        { role },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user,
        message: `User role updated to ${role}`
      });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user role'
      });
    }
  }

  // Update user status (Admin only)
  async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      // Check if req.user exists
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Prevent deactivating own account
      if (id === req.user._id.toString() && !isActive) {
        return res.status(400).json({
          success: false,
          error: 'Cannot deactivate your own account'
        });
      }

      const user = await User.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      console.error('Update user status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user status'
      });
    }
  }

  // Delete user (Admin only)
  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Check if req.user exists
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Prevent deleting own account
      if (id === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete your own account'
        });
      }

      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Check if user has articles
      const articleCount = await Article.countDocuments({ author: id });
      if (articleCount > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete user with existing articles. Transfer articles first or set user as inactive.'
        });
      }

      await User.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete user'
      });
    }
  }

  // Get user articles (Admin only)
  async getUserArticles(req, res) {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const status = req.query.status;
      const skip = (page - 1) * limit;

      // Verify user exists
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Build query
      const query = { author: id };
      if (status) query.status = status;

      const articles = await Article.find(query)
        .populate('author', 'username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await Article.countDocuments(query);

      // Get article statistics for this user
      const articleStats = await Article.aggregate([
        { $match: { author: user._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalViews: { $sum: '$views' },
            totalLikes: { $sum: '$likesCount' },
            avgTrendingScore: { $avg: '$trendingScore' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          user: {
            _id: user._id,
            username: user.username,
            email: user.email,
            role: user.role
          },
          articles,
          statistics: articleStats,
          pagination: {
            current: page,
            total: Math.ceil(total / limit),
            totalItems: total
          }
        }
      });
    } catch (error) {
      console.error('Get user articles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user articles'
      });
    }
  }

  // Get system health (Admin only)
  async getSystemHealth(req, res) {
    try {
      // Database health check
      const dbStatus = await this.checkDatabaseHealth();
      
      // Memory usage
      const memoryUsage = process.memoryUsage();
      
      // Uptime
      const uptime = process.uptime();
      
      // Active connections (MongoDB)
      let dbStats = { connections: { current: 'N/A' } };
      try {
        const db = require('mongoose').connection;
        if (db.db && db.db.admin) {
          dbStats = await db.db.admin().serverStatus();
        }
      } catch (dbError) {
        console.warn('Could not fetch database stats:', dbError.message);
      }
      
      // System metrics
      const systemHealth = {
        database: dbStatus,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB'
        },
        uptime: this.formatUptime(uptime),
        activeConnections: dbStats.connections ? dbStats.connections.current : 'N/A',
        environment: process.env.NODE_ENV,
        nodeVersion: process.version,
        platform: process.platform
      };

      res.json({
        success: true,
        data: systemHealth
      });
    } catch (error) {
      console.error('Get system health error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get system health'
      });
    }
  }

  // Create backup (Admin only)
  async createBackup(req, res) {
    try {
      const { type = 'metadata' } = req.body; // metadata, full

      // Check if req.user exists
      if (!req.user || !req.user.username) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // In a real implementation, this would connect to your backup service
      // For now, we'll return a mock response
      const backupInfo = {
        id: 'backup_' + Date.now(),
        type,
        timestamp: new Date(),
        status: 'completed',
        size: '2.5 MB',
        downloadUrl: null // Would be a signed URL in production
      };

      // Log backup activity
      console.log(`Backup created by admin ${req.user.username}:`, backupInfo);

      res.json({
        success: true,
        data: backupInfo,
        message: 'Backup created successfully'
      });
    } catch (error) {
      console.error('Create backup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create backup'
      });
    }
  }

  // Get system logs (Admin only)
  async getSystemLogs(req, res) {
    try {
      const { type = 'error', limit = 100 } = req.query;

      // In a real implementation, this would query your logging system
      // For now, we'll return mock logs
      const mockLogs = this.generateMockLogs(parseInt(limit), type);

      res.json({
        success: true,
        data: {
          logs: mockLogs,
          total: mockLogs.length,
          type,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Get system logs error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch system logs'
      });
    }
  }

  // Helper method to check database health
  async checkDatabaseHealth() {
    try {
      const db = require('mongoose').connection;
      
      // Check if connected
      if (db.readyState !== 1) {
        return { status: 'disconnected', details: 'Database not connected' };
      }

      // Simple query to verify database responsiveness
      await User.findOne().limit(1);
      
      return { 
        status: 'connected', 
        details: 'Database is responsive',
        readyState: db.readyState
      };
    } catch (error) {
      return { 
        status: 'error', 
        details: error.message 
      };
    }
  }

  // Helper method to format uptime
  formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
  }

  // Helper method to generate mock logs for demonstration
  generateMockLogs(limit, type) {
    const logLevels = ['error', 'warn', 'info', 'debug'];
    const logMessages = {
      error: [
        'Database connection timeout',
        'Failed to send email notification',
        'Image upload failed - Cloudinary error',
        'JWT token verification failed',
        'Rate limit exceeded for IP'
      ],
      warn: [
        'High memory usage detected',
        'Slow database query',
        'Failed ad impression tracking',
        'Newsletter email bounced',
        'Suspicious login attempt'
      ],
      info: [
        'New user registered',
        'Article published successfully',
        'Newsletter sent to subscribers',
        'Backup completed',
        'Trending scores updated'
      ],
      debug: [
        'Database query executed',
        'Cache hit for article',
        'User session created',
        'Ad unit served',
        'Analytics data processed'
      ]
    };

    const logs = [];
    const selectedMessages = logMessages[type] || logMessages.info;

    for (let i = 0; i < limit; i++) {
      const randomMessage = selectedMessages[Math.floor(Math.random() * selectedMessages.length)];
      const timestamp = new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000); // Random time in last 24 hours
      
      logs.push({
        id: `log_${i}`,
        timestamp: timestamp.toISOString(),
        level: type,
        message: randomMessage,
        source: `service-${Math.floor(Math.random() * 5) + 1}`,
        userId: Math.random() > 0.5 ? `user_${Math.floor(Math.random() * 100)}` : null
      });
    }

    // Sort by timestamp descending
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Get authors for article creation (Admin only)
  async getAuthors(req, res) {
    try {
      const authors = await User.find({
        role: { $in: ['admin', 'author', 'editor'] },
        isActive: true
      })
      .select('username email avatar bio role')
      .sort({ username: 1 })
      .exec();

      res.json({
        success: true,
        data: authors
      });
    } catch (error) {
      console.error('Get authors error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch authors'
      });
    }
  }
}

module.exports = new UserController();
