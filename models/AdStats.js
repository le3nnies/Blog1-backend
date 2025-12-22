// models/AdStats.js - UPDATED WITH BETTER WEEK LABELS
const mongoose = require('mongoose');

const adStatsSchema = new mongoose.Schema({
  // Overall Statistics
  totalRevenue: {
    type: Number,
    default: 0
  },
  totalClicks: {
    type: Number,
    default: 0
  },
  totalImpressions: {
    type: Number,
    default: 0
  },
  averageCTR: {
    type: Number,
    default: 0
  },
  
  // Today's Statistics
  todayClicks: {
    type: Number,
    default: 0
  },
  todayImpressions: {
    type: Number,
    default: 0
  },
  todayRevenue: {
    type: Number,
    default: 0
  },
  
  // Campaign Statistics
  activeCampaigns: {
    type: Number,
    default: 0
  },
  pendingCampaigns: {
    type: Number,
    default: 0
  },
  totalCampaigns: {
    type: Number,
    default: 0
  },
  
  // Performance Metrics
  averageCPC: {
    type: Number,
    default: 0
  },
  averageRPM: {
    type: Number,
    default: 0
  },

  // ===== WEEKLY REVENUE TRACKING =====
  weeklyRevenue: [{
    week: String, // Format: "Nov 10-16" or "This Week"
    weekKey: String, // Internal key for tracking: "2024-W46"
    startDate: Date,
    endDate: Date,
    revenue: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    campaigns: { type: Number, default: 0 },
    averageCTR: { type: Number, default: 0 },
    averageCPC: { type: Number, default: 0 }
  }],

  // Current week tracking
  currentWeek: {
    revenue: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    campaigns: { type: Number, default: 0 },
    startDate: Date,
    weekNumber: String, // User-friendly: "This Week"
    weekKey: String, // Internal: "2024-W46"
    averageCTR: { type: Number, default: 0 },
    averageCPC: { type: Number, default: 0 }
  },

  // Weekly performance metrics
  weeklyPerformance: {
    bestWeek: {
      week: String,
      revenue: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 }
    },
    worstWeek: {
      week: String,
      revenue: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 }
    },
    averageWeeklyRevenue: { type: Number, default: 0 },
    totalWeeksTracked: { type: Number, default: 0 }
  },
  
  // Track when weekly tracking started
  trackingStartDate: {
    type: Date,
    default: Date.now
  },
  
  // Timestamps
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Static method to get or create stats document
adStatsSchema.statics.getStats = async function() {
  let stats = await this.findOne();
  if (!stats) {
    stats = new this();
    await stats.save();
  }
  return stats;
};

// Method to get current week key (ISO format for internal tracking)
adStatsSchema.methods.getCurrentWeekKey = function() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
};

// Method to get user-friendly week label
adStatsSchema.methods.getWeekLabel = function(date, isCurrentWeek = false) {
  if (isCurrentWeek) {
    return 'This Week';
  }

  const start = new Date(date);
  const end = new Date(date);
  end.setDate(start.getDate() + 6);
  
  const startMonth = start.toLocaleString('default', { month: 'short' });
  const endMonth = end.toLocaleString('default', { month: 'short' });
  
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}-${end.getDate()}`;
  } else {
    return `${startMonth} ${start.getDate()}-${endMonth} ${end.getDate()}`;
  }
};

// Method to get relative week label
adStatsSchema.methods.getRelativeWeekLabel = function(weekIndex, totalWeeks) {
  if (weekIndex === totalWeeks - 1) return 'This Week';
  if (weekIndex === totalWeeks - 2) return 'Last Week';
  if (weekIndex === totalWeeks - 3) return '2 Weeks Ago';
  if (weekIndex === totalWeeks - 4) return '3 Weeks Ago';
  
  const weeksAgo = totalWeeks - weekIndex - 1;
  return `${weeksAgo} Weeks Ago`;
};

// Method to get start and end dates for a week
adStatsSchema.methods.getWeekDates = function(weekKey) {
  const [year, week] = weekKey.split('-W');
  const simple = new Date(parseInt(year), 0, 1 + (parseInt(week) - 1) * 7);
  const dayOfWeek = simple.getDay();
  const startOfWeek = new Date(simple);
  startOfWeek.setDate(simple.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return { startDate: startOfWeek, endDate: endOfWeek };
};

// Method to update weekly revenue tracking
adStatsSchema.methods.updateWeeklyRevenue = async function() {
  const AdCampaign = mongoose.model('AdCampaign');
  
  try {
    const currentWeekKey = this.getCurrentWeekKey();
    const { startDate, endDate } = this.getWeekDates(currentWeekKey);
    const currentWeekLabel = this.getWeekLabel(startDate, true);

    // Get campaigns with activity this week
    const campaigns = await AdCampaign.find({
      $or: [
        { clicks: { $gt: 0 } },
        { impressions: { $gt: 0 } },
        { spent: { $gt: 0 } }
      ]
    });

    // Calculate weekly totals
    const weeklyData = campaigns.reduce((acc, campaign) => {
      acc.revenue += campaign.spent || 0;
      acc.clicks += campaign.clicks || 0;
      acc.impressions += campaign.impressions || 0;
      if (campaign.clicks > 0 || campaign.impressions > 0) {
        acc.campaigns += 1;
      }
      return acc;
    }, { revenue: 0, clicks: 0, impressions: 0, campaigns: 0 });

    // Calculate weekly averages
    weeklyData.averageCTR = weeklyData.impressions > 0 
      ? (weeklyData.clicks / weeklyData.impressions) * 100 
      : 0;
    weeklyData.averageCPC = weeklyData.clicks > 0 
      ? weeklyData.revenue / weeklyData.clicks 
      : 0;

    // Update current week
    this.currentWeek = {
      revenue: weeklyData.revenue,
      clicks: weeklyData.clicks,
      impressions: weeklyData.impressions,
      campaigns: weeklyData.campaigns,
      startDate: startDate,
      weekNumber: currentWeekLabel, // User-friendly label
      weekKey: currentWeekKey, // Internal key
      averageCTR: weeklyData.averageCTR,
      averageCPC: weeklyData.averageCPC
    };

    // Update weekly history
    const weekIndex = this.weeklyRevenue.findIndex(w => w.weekKey === currentWeekKey);
    
    if (weekIndex >= 0) {
      this.weeklyRevenue[weekIndex] = {
        week: currentWeekLabel,
        weekKey: currentWeekKey,
        startDate: startDate,
        endDate: endDate,
        ...weeklyData
      };
    } else {
      this.weeklyRevenue.push({
        week: currentWeekLabel,
        weekKey: currentWeekKey,
        startDate: startDate,
        endDate: endDate,
        ...weeklyData
      });
    }

    // Update all week labels to be consistent
    this.weeklyRevenue.forEach((weekData, index) => {
      const isCurrent = weekData.weekKey === currentWeekKey;
      const relativeLabel = this.getRelativeWeekLabel(index, this.weeklyRevenue.length);
      weekData.week = isCurrent ? 'This Week' : relativeLabel;
    });

    // Keep only last 12 weeks
    if (this.weeklyRevenue.length > 12) {
      this.weeklyRevenue = this.weeklyRevenue.slice(-12);
    }

    // Update weekly performance metrics
    await this.updateWeeklyPerformance();

    await this.save();
    return this;
  } catch (error) {
    console.error('Error updating weekly revenue:', error);
    throw error;
  }
};

// Method to update weekly performance analytics
adStatsSchema.methods.updateWeeklyPerformance = async function() {
  if (this.weeklyRevenue.length === 0) return;

  // Find best and worst weeks
  let bestWeek = this.weeklyRevenue[0];
  let worstWeek = this.weeklyRevenue[0];
  let totalRevenue = 0;
  let totalClicks = 0;

  this.weeklyRevenue.forEach(week => {
    totalRevenue += week.revenue;
    totalClicks += week.clicks;

    if (week.revenue > bestWeek.revenue) {
      bestWeek = week;
    }
    if (week.revenue < worstWeek.revenue && week.revenue > 0) {
      worstWeek = week;
    }
  });

  this.weeklyPerformance = {
    bestWeek: {
      week: bestWeek.week, // User-friendly label
      revenue: bestWeek.revenue,
      clicks: bestWeek.clicks
    },
    worstWeek: {
      week: worstWeek.week, // User-friendly label
      revenue: worstWeek.revenue,
      clicks: worstWeek.clicks
    },
    averageWeeklyRevenue: totalRevenue / this.weeklyRevenue.length,
    totalWeeksTracked: this.weeklyRevenue.length
  };
};

// Method to get weekly growth metrics
adStatsSchema.methods.getWeeklyGrowth = function() {
  if (this.weeklyRevenue.length < 2) {
    return {
      revenueGrowth: 0,
      clickGrowth: 0,
      impressionGrowth: 0,
      hasEnoughData: false
    };
  }

  const currentWeek = this.weeklyRevenue[this.weeklyRevenue.length - 1];
  const previousWeek = this.weeklyRevenue[this.weeklyRevenue.length - 2];

  const revenueGrowth = previousWeek.revenue > 0 
    ? ((currentWeek.revenue - previousWeek.revenue) / previousWeek.revenue) * 100 
    : currentWeek.revenue > 0 ? 100 : 0;

  const clickGrowth = previousWeek.clicks > 0 
    ? ((currentWeek.clicks - previousWeek.clicks) / previousWeek.clicks) * 100 
    : currentWeek.clicks > 0 ? 100 : 0;

  const impressionGrowth = previousWeek.impressions > 0 
    ? ((currentWeek.impressions - previousWeek.impressions) / previousWeek.impressions) * 100 
    : currentWeek.impressions > 0 ? 100 : 0;

  return {
    revenueGrowth: Math.round(revenueGrowth * 100) / 100,
    clickGrowth: Math.round(clickGrowth * 100) / 100,
    impressionGrowth: Math.round(impressionGrowth * 100) / 100,
    hasEnoughData: true,
    currentWeek: currentWeek.week, // User-friendly labels
    previousWeek: previousWeek.week
  };
};

// Method to get weekly trends (last 8 weeks)
adStatsSchema.methods.getWeeklyTrends = function(weeks = 8) {
  const recentWeeks = this.weeklyRevenue.slice(-weeks);
  
  return recentWeeks.map(week => ({
    week: week.week, // User-friendly label
    weekKey: week.weekKey, // Internal key
    revenue: week.revenue,
    clicks: week.clicks,
    impressions: week.impressions,
    ctr: week.averageCTR,
    cpc: week.averageCPC,
    campaigns: week.campaigns,
    startDate: week.startDate,
    endDate: week.endDate
  }));
};

// Method to update statistics from campaigns (enhanced with weekly tracking)
adStatsSchema.methods.updateFromCampaigns = async function() {
  const AdCampaign = mongoose.model('AdCampaign');
  
  try {
    const campaigns = await AdCampaign.find();
    const activeCampaigns = await AdCampaign.countDocuments({ status: 'active' });
    const pendingCampaigns = await AdCampaign.countDocuments({ status: 'pending' });
    
    // Calculate totals
    const totals = campaigns.reduce((acc, campaign) => ({
      clicks: acc.clicks + (campaign.clicks || 0),
      impressions: acc.impressions + (campaign.impressions || 0),
      revenue: acc.revenue + (campaign.spent || 0)
    }), { clicks: 0, impressions: 0, revenue: 0 });
    
    // Update main stats
    this.totalClicks = totals.clicks;
    this.totalImpressions = totals.impressions;
    this.totalRevenue = totals.revenue;
    this.averageCTR = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    this.averageCPC = totals.clicks > 0 ? totals.revenue / totals.clicks : 0;
    this.averageRPM = totals.impressions > 0 ? (totals.revenue / totals.impressions) * 1000 : 0;
    
    this.activeCampaigns = activeCampaigns;
    this.pendingCampaigns = pendingCampaigns;
    this.totalCampaigns = campaigns.length;
    
    // Update today's stats (simplified - use totals for demo)
    this.todayClicks = totals.clicks;
    this.todayImpressions = totals.impressions;
    this.todayRevenue = totals.revenue;
    
    // Update weekly revenue tracking
    await this.updateWeeklyRevenue();
    
    this.lastUpdated = new Date();
    
    await this.save();
    return this;
  } catch (error) {
    console.error('Error updating stats from campaigns:', error);
    throw error;
  }
};

// Pre-save middleware to round numbers
adStatsSchema.pre('save', function(next) {
  // Round to 2 decimal places for currency values
  this.totalRevenue = Math.round(this.totalRevenue * 100) / 100;
  this.todayRevenue = Math.round(this.todayRevenue * 100) / 100;
  this.averageCPC = Math.round(this.averageCPC * 100) / 100;
  this.averageRPM = Math.round(this.averageRPM * 100) / 100;
  
  // Round to 2 decimal places for percentages
  this.averageCTR = Math.round(this.averageCTR * 100) / 100;
  
  // Round weekly performance metrics
  if (this.weeklyPerformance) {
    this.weeklyPerformance.averageWeeklyRevenue = Math.round(this.weeklyPerformance.averageWeeklyRevenue * 100) / 100;
  }
  
  // Round weekly revenue data
  this.weeklyRevenue.forEach(week => {
    week.revenue = Math.round(week.revenue * 100) / 100;
    week.averageCTR = Math.round(week.averageCTR * 100) / 100;
    week.averageCPC = Math.round(week.averageCPC * 100) / 100;
  });
  
  // Round current week data
  if (this.currentWeek) {
    this.currentWeek.revenue = Math.round(this.currentWeek.revenue * 100) / 100;
    this.currentWeek.averageCTR = Math.round(this.currentWeek.averageCTR * 100) / 100;
    this.currentWeek.averageCPC = Math.round(this.currentWeek.averageCPC * 100) / 100;
  }
  
  next();
});

module.exports = mongoose.model('AdStats', adStatsSchema);