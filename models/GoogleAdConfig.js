// models/GoogleAdConfig.js
const mongoose = require('mongoose');

const googleAdConfigSchema = new mongoose.Schema({
  adUnit: {
    type: String,
    required: true
  },
  adSlot: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  position: {
    type: String,
    enum: ['header', 'sidebar', 'footer', 'inline', 'between_posts'],
    required: true
  },
  displayOn: [{
    type: String,
    enum: ['home', 'article', 'category', 'about', 'contact']
  }],
  maxWidth: {
    type: String
  },
  customStyle: {
    type: String
  },
  // Enhanced fields for better ad management
  size: {
    width: {
      type: Number,
      required: true,
      default: 300
    },
    height: {
      type: Number,
      required: true,
      default: 250
    }
  },
  format: {
    type: String,
    enum: ['auto', 'rectangle', 'vertical', 'horizontal', 'square'],
    default: 'auto'
  },
  responsive: {
    type: Boolean,
    default: true
  },
  adSenseData: {
    adType: {
      type: String,
      enum: ['display', 'in-feed', 'in-article', 'matched-content'],
      default: 'display'
    },
    style: {
      type: String,
      enum: ['default', 'custom'],
      default: 'default'
    }
  },
  performance: {
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
    earnings: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date
    }
  },
  template: {
    type: String,
    enum: ['banner', 'sidebar', 'mobile', 'responsive', 'custom'],
    default: 'custom'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GoogleAdConfig', googleAdConfigSchema);