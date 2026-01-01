const express = require('express');
const router = express.Router();
const { URLEncryption } = require('../utils/urlObfuscation');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const User = require('../models/User');

/**
 * Secure Admin Routes with URL Obfuscation
 * These routes use encrypted tokens instead of plain parameters
 */

// Middleware to extract secure parameters
const extractSecureParams = (req, res, next) => {
  try {
    req.secureParams = URLEncryption.extractSecureParams(req);
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or expired security token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/admin/secure/users/:token
 * Secure user details access
 */
router.get('/users/:token', authMiddleware, extractSecureParams, async (req, res) => {
  try {
    const { userId } = req.secureParams;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required'
      });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Secure user access error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to access user data'
    });
  }
});

/**
 * POST /api/admin/secure/action
 * Secure admin action with encrypted parameters
 */
router.post('/action', authMiddleware, extractSecureParams, async (req, res) => {
  try {
    const { action, targetId, parameters } = req.secureParams;

    // Verify admin permissions
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    let result;

    switch (action) {
      case 'delete_user':
        result = await User.findByIdAndDelete(targetId);
        break;
      case 'update_user_role':
        result = await User.findByIdAndUpdate(targetId, { role: parameters.role });
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Unknown action'
        });
    }

    res.json({
      success: true,
      message: `${action} completed successfully`,
      data: result
    });
  } catch (error) {
    console.error('Secure admin action error:', error);
    res.status(500).json({
      success: false,
      error: 'Action failed'
    });
  }
});

/**
 * GET /api/admin/secure/token/generate
 * Generate secure token for client-side use
 */
router.get('/token/generate', authMiddleware, (req, res) => {
  try {
    const { action, params } = req.query;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action parameter required'
      });
    }

    const secureParams = {
      action,
      userId: req.user._id,
      timestamp: Date.now(),
      ...JSON.parse(params || '{}')
    };

    const token = URLEncryption.encrypt(secureParams);

    res.json({
      success: true,
      token,
      expiresIn: '5 minutes'
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate secure token'
    });
  }
});

module.exports = router;
