// backend/models/AdsSettings.js
const mongoose = require('mongoose');

const adsSettingsSchema = new mongoose.Schema({
  // General Settings
  siteName: {
    type: String,
    default: "TrendBlog"
  },
  adCurrency: {
    type: String,
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    default: 'USD'
  },
  autoApproveCampaigns: {
    type: Boolean,
    default: false
  },
  requireAdvertiserVerification: {
    type: Boolean,
    default: true
  },
  
  // Display Settings
  maxAdsPerPage: {
    type: Number,
    min: 1,
    max: 10,
    default: 4
  },
  adDensity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  showAdsToSubscribers: {
    type: Boolean,
    default: false
  },
  
  // Payment & Billing
  paymentGateway: {
    type: String,
    enum: ['stripe', 'paypal', 'manual'],
    default: 'stripe'
  },
  stripePublicKey: {
    type: String,
    default: ""
  },
  stripeSecretKey: {
    type: String,
    default: ""
  },
  paypalClientId: {
    type: String,
    default: ""
  },
  defaultCommissionRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 30
  },
  taxRate: {
    type: Number,
    min: 0,
    max: 50,
    default: 0
  },
  
  // Notifications
  emailNotifications: {
    type: Boolean,
    default: true
  },
  notifyOnNewCampaign: {
    type: Boolean,
    default: true
  },
  notifyOnCampaignApproval: {
    type: Boolean,
    default: true
  },
  notifyOnLowBalance: {
    type: Boolean,
    default: true
  },
  adminEmail: {
    type: String,
    default: ""
  },
  
  // Privacy & Compliance
  enableGDPR: {
    type: Boolean,
    default: true
  },
  enableCCPA: {
    type: Boolean,
    default: false
  },
  privacyPolicyUrl: {
    type: String,
    default: ""
  },
  termsOfServiceUrl: {
    type: String,
    default: ""
  },
  
  // Google AdSense
  googleAdSenseEnabled: {
    type: Boolean,
    default: false
  },
  googleAdSenseClientId: {
    type: String,
    default: ""
  },
  autoAdsEnabled: {
    type: Boolean,
    default: true
  },
  
  // Advanced
  adRefreshInterval: {
    type: Number,
    min: 0,
    max: 3600,
    default: 0
  },
  enableAdBlockRecovery: {
    type: Boolean,
    default: true
  },
  customAdCSS: {
    type: String,
    default: ""
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
adsSettingsSchema.statics.getSettings = function() {
  return this.findOne().then(settings => {
    if (!settings) {
      settings = new this();
      return settings.save();
    }
    return settings;
  });
};

// Update settings (ensure only one document exists)
adsSettingsSchema.statics.updateSettings = function(updates) {
  return this.findOneAndUpdate(
    {}, // Empty filter to match any document
    { $set: updates },
    {
      new: true, // Return the updated document
      upsert: true, // Create if doesn't exist
      runValidators: true // Run schema validators
    }
  );
};

module.exports = mongoose.model('AdsSettings', adsSettingsSchema);