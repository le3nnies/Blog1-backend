// models/ClickAnalytics.js
const mongoose = require('mongoose');

const clickAnalyticsSchema = new mongoose.Schema({
  // Ad Campaign Reference
  adCampaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdCampaign',
    required: true
  },
  
  // Click Information
  clickData: {
    ipAddress: String,
    userAgent: String,
    referrer: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    cost: {
      type: Number,
      default: 0
    }
  },
  
  // User/Session Information
  sessionId: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Geographic Data
  geographicData: {
    country: String,
    region: String,
    city: String,
    timezone: String
  },
  
  // Device Information
  deviceData: {
    type: { type: String }, // mobile, desktop, tablet
    browser: String,
    os: String,
    screenResolution: String
  },
  
  // Campaign Context
  campaignContext: {
    position: String, // header, sidebar, etc.
    category: String,
    creativeId: String
  },
  
  // Conversion Tracking
  conversion: {
    converted: {
      type: Boolean,
      default: false
    },
    conversionType: String, // purchase, signup, download, etc.
    conversionValue: Number,
    conversionDate: Date
  }
}, {
  timestamps: true
});

// Index for faster queries
clickAnalyticsSchema.index({ adCampaign: 1, timestamp: -1 });
clickAnalyticsSchema.index({ timestamp: 1 });
clickAnalyticsSchema.index({ 'geographicData.country': 1 });
clickAnalyticsSchema.index({ 'deviceData.type': 1 });

// Static method to get click analytics summary
clickAnalyticsSchema.statics.getClickSummary = async function(adCampaignId, startDate, endDate) {
  const matchStage = {
    adCampaign: new mongoose.Types.ObjectId(adCampaignId),
    timestamp: { $gte: startDate, $lte: endDate }
  };

  const result = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalClicks: { $sum: 1 },
        totalCost: { $sum: '$clickData.cost' },
        uniqueUsers: { $addToSet: '$userId' },
        conversions: {
          $sum: { $cond: ['$conversion.converted', 1, 0] }
        },
        conversionValue: {
          $sum: '$conversion.conversionValue'
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalClicks: 1,
        totalCost: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        conversions: 1,
        conversionValue: 1,
        averageCostPerClick: { $divide: ['$totalCost', '$totalClicks'] },
        conversionRate: { $divide: ['$conversions', '$totalClicks'] }
      }
    }
  ]);

  return result[0] || {
    totalClicks: 0,
    totalCost: 0,
    uniqueUsers: 0,
    conversions: 0,
    conversionValue: 0,
    averageCostPerClick: 0,
    conversionRate: 0
  };
};

// Method to track conversion
clickAnalyticsSchema.statics.trackConversion = async function(clickId, conversionData) {
  return await this.findByIdAndUpdate(
    clickId,
    {
      $set: {
        'conversion.converted': true,
        'conversion.conversionType': conversionData.type,
        'conversion.conversionValue': conversionData.value,
        'conversion.conversionDate': new Date()
      }
    },
    { new: true }
  );
};

module.exports = mongoose.model('ClickAnalytics', clickAnalyticsSchema);