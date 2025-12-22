const mongoose = require('mongoose');

const adCampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  advertiser: {
    type: String,
    required: true
  },
  advertiserEmail: {
    type: String,
    required: true
  },
  advertiserPhone: {
    type: String
  },
  type: {
    type: String,
    enum: ['banner', 'sidebar', 'inline', 'popup'],
    default: 'banner'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'paused', 'completed'],
    default: 'pending'
  },
  budget: {
    type: Number,
    required: true,
    min: 0
  },
  spent: {
    type: Number,
    default: 0,
    min: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  targetCategories: [{
    type: String
  }],
  targetPositions: [{
    type: String,
    enum: ['header', 'sidebar', 'footer', 'inline', 'between_posts', 'popup']
  }],
  impressions: {
    type: Number,
    default: 0
  },
  clicks: {
    type: Number,
    default: 0
  },
  ctr: {
    type: Number,
    default: 0
  },
  // ADD THIS FIELD
  clickUrl: {
    type: String,
    required: true,
    default: 'https://example.com'
  },

  // Media fields for uploaded images/videos
  mediaUrl: {
    type: String,
    //required: true,
    trim: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    default: 'image'
  },

  fileName: {
    type: String,
    trim: true
  },
  fileType: {
    type: String,
    trim: true
  },
  fileSize: {
    type: Number,
    default: 0
  },
  cloudinaryPublicId: {
    type: String,
    trim: true
  },
  cloudinaryFormat: {
    type: String,
    trim: true
  },
  videoDuration: {
    type: Number, // Duration in seconds
    default: 0
  },
  bidAmount: {
    type: Number,
    default: 0.15
  },
  bidStrategy: {
    type: String,
    enum: ['cpc', 'cpm', 'cpa'],
    default: 'cpc'
  },
  dailyBudget: {
    type: Number,
    default: 0 // 0 means no daily limit
  },
  qualityScore: {
    type: Number,
    min: 1,
    max: 10,
    default: 7
  },
  competition: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  }
}, {
  timestamps: true
});

// Calculate CTR before saving
adCampaignSchema.pre('save', function(next) {
  if (this.impressions > 0) {
    this.ctr = (this.clicks / this.impressions) * 100;
  }
  next();
});

module.exports = mongoose.model('AdCampaign', adCampaignSchema);