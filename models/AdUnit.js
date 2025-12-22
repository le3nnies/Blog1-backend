const mongoose = require('mongoose');

const adUnitSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  type: { 
    type: String, 
    enum: ['banner', 'sidebar', 'in-content', 'popup'], 
    required: true 
  },
  position: { 
    type: String, 
    required: true 
  },
  adCode: { 
    type: String, 
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  // Performance tracking
  impressions: { 
    type: Number, 
    default: 0 
  },
  clicks: { 
    type: Number, 
    default: 0 
  },
  revenue: { 
    type: Number, 
    default: 0 
  },
  
  // Settings
  refreshRate: { 
    type: Number, 
    default: 30,
    min: 15,
    max: 300
  },
  size: { 
    type: String,
    enum: ['728x90', '300x250', '300x600', '160x600', '320x100'],
    required: true
  },
  
  // Targeting
  categories: [{
    type: String
  }],
  devices: [{
    type: String,
    enum: ['desktop', 'mobile', 'tablet']
  }]
}, {
  timestamps: true
});

// Index for performance
adUnitSchema.index({ isActive: 1, type: 1 });

module.exports = mongoose.model('AdUnit', adUnitSchema);