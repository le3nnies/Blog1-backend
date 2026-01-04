// models/Session.js
const mongoose = require('mongoose');

// Session configuration constants (matching tracking.js)
const SESSION_CONFIG = {
  inactivityTimeout: 2 * 60 * 60 * 1000, // 2 hours of inactivity
  maxSessionDuration: 8 * 60 * 60 * 1000, // 8 hours absolute maximum
  cookieExpiration: 30 * 24 * 60 * 60 * 1000, // 30 days
  extendOnActivity: true // Extend session on any interaction
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
    index: true
  },
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
  screenResolution: String, // e.g., "1920x1080"
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
    type: Number, // in seconds
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
  }
}, {
  timestamps: true
});

// Indexes
sessionSchema.index({ endTime: -1 });
sessionSchema.index({ userId: 1, endTime: -1 });
sessionSchema.index({ source: 1, endTime: -1 });
sessionSchema.index({ deviceType: 1, endTime: -1 });
sessionSchema.index({ country: 1, endTime: -1 });
sessionSchema.index({ countryCode: 1, endTime: -1 });
sessionSchema.index({ city: 1, endTime: -1 });
sessionSchema.index({ region: 1, endTime: -1 });
sessionSchema.index({ continent: 1, endTime: -1 });
sessionSchema.index({ isActive: 1, endTime: -1 });

// Pre-save middleware to calculate duration
sessionSchema.pre('save', function(next) {
  if (this.startTime && this.endTime) {
    this.duration = Math.round((this.endTime - this.startTime) / 1000);
  }
  next();
});

// Method to update session end time
sessionSchema.methods.updateEndTime = function() {
  this.endTime = new Date();
  this.duration = Math.round((this.endTime - this.startTime) / 1000);
  return this.save();
};

// Method to increment page count
sessionSchema.methods.incrementPageCount = function() {
  this.pageCount += 1;
  this.endTime = new Date();
  return this.save();
};

// Method to check if session is still active (within timeout window)
sessionSchema.methods.isSessionActive = function() {
  const now = new Date();
  const timeSinceLastActivity = now - this.endTime;
  const timeoutMs = SESSION_CONFIG.inactivityTimeout;

  return timeSinceLastActivity < timeoutMs && this.isActive;
};

// Method to extend session activity
sessionSchema.methods.extendSession = function() {
  this.endTime = new Date();
  this.duration = Math.round((this.endTime - this.startTime) / 1000);
  return this.save();
};

// Static method to find active session for a user/IP combination
sessionSchema.statics.findActiveSession = async function(sessionId, ipAddress, userAgent) {
  // First try to find by sessionId if provided
  if (sessionId) {
    const session = await this.findOne({ sessionId, isActive: true });
    if (session && session.isSessionActive()) {
      return session;
    }
  }

  // If no valid session found by ID, try to find recent session by IP and user agent
  // This handles cases where cookies are cleared but user continues browsing
  const recentSession = await this.findOne({
    ipAddress,
    userAgent,
    isActive: true,
    endTime: { $gte: new Date(Date.now() - SESSION_CONFIG.inactivityTimeout) }
  }).sort({ endTime: -1 });

  if (recentSession && recentSession.isSessionActive()) {
    return recentSession;
  }

  return null;
};

// Static method to check if visitor is new (has no previous sessions)
sessionSchema.statics.isNewVisitor = async function(ipAddress, userAgent) {
  const existingSession = await this.findOne({
    $or: [
      { ipAddress },
      { userAgent }
    ],
    createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Look back 24 hours
  });

  return !existingSession;
};

// Static method to get active sessions
sessionSchema.statics.getActiveSessions = function(minutes = 5) {
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
  return this.countDocuments({
    endTime: { $gte: cutoffTime },
    isActive: true
  });
};

// Static method to get session stats
sessionSchema.statics.getSessionStats = async function(startDate, endDate) {
  const matchStage = {
    createdAt: { $gte: startDate, $lte: endDate }
  };

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        avgPagesPerSession: { $avg: '$pageCount' },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        totalSessions: 1,
        avgDuration: { $round: ['$avgDuration', 2] },
        avgPagesPerSession: { $round: ['$avgPagesPerSession', 2] },
        uniqueUsers: { $size: '$uniqueUsers' }
      }
    }
  ]);

  return stats[0] || {
    totalSessions: 0,
    avgDuration: 0,
    avgPagesPerSession: 0,
    uniqueUsers: 0
  };
};

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
