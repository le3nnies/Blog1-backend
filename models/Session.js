// models/Session.js - Add sessionType and isAuthenticated fields
const mongoose = require('mongoose');

// Session configuration constants
const SESSION_CONFIG = {
  inactivityTimeout: 2 * 60 * 60 * 1000, // 2 hours of inactivity
  maxSessionDuration: 8 * 60 * 60 * 1000, // 8 hours absolute maximum
  cookieExpiration: 30 * 24 * 60 * 60 * 1000, // 30 days
  extendOnActivity: true,
  
  // Cookie names for different session types
  COOKIE_NAMES: {
    TRACKING: 'tracking_session_id',
    AUTH: 'session_id'
  }
};

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  
  // NEW: Session type fields
  sessionType: {
    type: String,
    enum: ['tracking', 'authentication'],
    default: 'tracking'
  },
  isAuthenticated: {
    type: Boolean,
    default: false
  },
  
  // Existing fields...
  ipAddress: String,
  userAgent: String,
  deviceType: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'tv', 'console', 'wearable', 'unknown'],
    default: 'unknown'
  },
  deviceCategory: {
    type: String,
    enum: ['smartphone', 'feature-phone', 'tablet', 'desktop', 'laptop', 'tv', 'console', 'wearable', 'unknown'],
    default: 'unknown'
  },
  deviceBrand: String,
  deviceModel: String,
  screenResolution: String,
  screenWidth: Number,
  screenHeight: Number,
  isTouchDevice: {
    type: Boolean,
    default: false
  },
  browser: String,
  browserVersion: String,
  os: String,
  osVersion: String,
  country: String,
  countryCode: String,
  city: String,
  region: String,
  continent: String,
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date,
    default: Date.now
  },
  pageCount: {
    type: Number,
    default: 1,
    min: 1
  },
  duration: {
    type: Number,
    default: 0
  },
  referrer: String,
  source: {
    type: String,
    enum: ['direct', 'google', 'social', 'email', 'referral', 'other'],
    default: 'direct'
  },
  medium: String,
  campaign: String,
  isActive: {
    type: Boolean,
    default: true
  },
  
  // NEW: Track conversion from tracking to auth
  convertedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Add new indexes for session type
sessionSchema.index({ sessionType: 1, endTime: -1 });
sessionSchema.index({ isAuthenticated: 1, endTime: -1 });
sessionSchema.index({ convertedAt: 1, userId: 1 });

// Existing pre-save middleware remains...

// NEW: Method to convert tracking session to auth session
sessionSchema.methods.convertToAuthSession = function(userId) {
  this.userId = userId;
  this.sessionType = 'authentication';
  this.isAuthenticated = true;
  this.convertedAt = new Date();
  return this.save();
};

// Update the findActiveSession method to consider session type
sessionSchema.statics.findActiveSession = async function(sessionId, ipAddress, userAgent, sessionType = 'tracking') {
  // First try to find by sessionId if provided
  if (sessionId) {
    const session = await this.findOne({ 
      sessionId, 
      isActive: true,
      sessionType // NEW: Filter by session type
    });
    
    if (session && session.isSessionActive()) {
      return session;
    }
  }

  // If no valid session found by ID, try to find recent session
  const recentSession = await this.findOne({
    ipAddress,
    userAgent,
    isActive: true,
    sessionType, // NEW: Filter by session type
    endTime: { $gte: new Date(Date.now() - SESSION_CONFIG.inactivityTimeout) }
  }).sort({ endTime: -1 });

  if (recentSession && recentSession.isSessionActive()) {
    return recentSession;
  }

  return null;
};

// NEW: Static method to find auth session
sessionSchema.statics.findAuthSession = async function(sessionId) {
  if (!sessionId) return null;
  
  const session = await this.findOne({ 
    sessionId, 
    isActive: true,
    sessionType: 'authentication',
    isAuthenticated: true
  });
  
  if (session && session.isSessionActive()) {
    return session;
  }
  
  return null;
};

module.exports = { Session: mongoose.model('Session', sessionSchema), SESSION_CONFIG };
