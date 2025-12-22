const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  // Session data
  sessionId: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Page view data
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article'
  },
  pageUrl: {
    type: String,
    required: true
  },
  referrer: {
    type: String
  },
  
  // User agent data
  userAgent: {
    type: String
  },
  deviceType: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet']
  },
  browser: {
    type: String
  },
  os: {
    type: String
  },
  
  // Location data
  ipAddress: {
    type: String
  },
  country: {
    type: String
  },
  city: {
    type: String
  },
  
  // Engagement data
  timeOnPage: {
    type: Number // in seconds
  },
  scrollDepth: {
    type: Number // percentage
  },
  
  // Ad data
  adClicks: [{
    adUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdUnit'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for analytics queries
analyticsSchema.index({ timestamp: -1 });
analyticsSchema.index({ articleId: 1, timestamp: -1 });
analyticsSchema.index({ country: 1, timestamp: -1 });
analyticsSchema.index({ deviceType: 1, timestamp: -1 });

module.exports = mongoose.model('Analytics', analyticsSchema);