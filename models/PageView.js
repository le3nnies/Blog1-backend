
// models/PageView.js
const mongoose = require('mongoose');

const pageViewSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    index: true
  },
  pageUrl: {
    type: String,
    required: true
  },
  pageTitle: String,
  referrer: String,
  source: {
    type: String,
    enum: ['direct', 'google', 'social', 'email', 'referral', 'other'],
    default: 'direct'
  },
  medium: String,
  campaign: String,
  content: String,
  term: String,
  ipAddress: String,
  userAgent: String,
  country: String,
  city: String,
  region: String,
  deviceType: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'tv', 'console', 'unknown'],
    default: 'desktop'
  },
  deviceCategory: {
    type: String,
    enum: ['desktop', 'smartphone', 'tablet', 'tv', 'console', 'wearable', 'feature-phone', 'unknown'],
    default: 'desktop'
  },
  browser: String,
  os: String,
  screenResolution: String,
  language: String,
  timezone: String,
  timeOnPage: {
    type: Number,
    default: 0
  },
  isBounce: {
    type: Boolean,
    default: false
  },
  isNewSession: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for better query performance
pageViewSchema.index({ sessionId: 1, createdAt: -1 });
pageViewSchema.index({ articleId: 1, createdAt: -1 });
pageViewSchema.index({ userId: 1, createdAt: -1 });
pageViewSchema.index({ source: 1, createdAt: -1 });
pageViewSchema.index({ deviceType: 1, createdAt: -1 });
pageViewSchema.index({ country: 1, createdAt: -1 });

// Virtual for formatted date
pageViewSchema.virtual('date').get(function() {
  return this.createdAt.toISOString().split('T')[0];
});

// Method to get basic info
pageViewSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    pageUrl: this.pageUrl,
    pageTitle: this.pageTitle,
    referrer: this.referrer,
    source: this.source,
    deviceType: this.deviceType,
    country: this.country,
    city: this.city,
    createdAt: this.createdAt,
    timeOnPage: this.timeOnPage
  };
};

const PageView = mongoose.model('PageView', pageViewSchema);

module.exports = PageView;