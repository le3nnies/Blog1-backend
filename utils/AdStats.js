// utils/statsManager.js
const AdStats = require('../models/AdStats');
const AdCampaign = require('../models/AdCampaign');

class StatsManager {
  // Update all statistics
  static async updateAllStats() {
    try {
      const stats = await AdStats.getStats();
      
      // Update from campaigns
      await stats.updateFromCampaigns();
      
      // Update category performance
      await stats.updateCategoryPerformance();
      
      console.log('Statistics updated successfully');
      return stats;
    } catch (error) {
      console.error('Error updating statistics:', error);
      throw error;
    }
  }
  
  // Get comprehensive stats with auto-update
  static async getComprehensiveStats(autoUpdate = true) {
    try {
      if (autoUpdate) {
        await this.updateAllStats();
      }
      
      const stats = await AdStats.getStats();
      const campaigns = await AdCampaign.find().sort({ createdAt: -1 });
      
      return {
        summary: stats.getPerformanceSummary(),
        dailyTrends: stats.getDailyTrends(7),
        topCampaigns: stats.topPerformingCampaigns,
        categoryPerformance: stats.categoryPerformance,
        recentCampaigns: campaigns.slice(0, 10),
        lastUpdated: stats.lastUpdated
      };
    } catch (error) {
      console.error('Error getting comprehensive stats:', error);
      throw error;
    }
  }
  
  // Reset today's statistics (run via cron job)
  static async resetDailyStats() {
    try {
      const stats = await AdStats.getStats();
      stats.resetTodayStats();
      await stats.save();
      console.log('Daily statistics reset');
    } catch (error) {
      console.error('Error resetting daily stats:', error);
    }
  }
  
  // Get stats for dashboard
  static async getDashboardStats() {
    try {
      const stats = await AdStats.getStats();
      const campaigns = await AdCampaign.find({ status: 'active' });
      
      const activeAdvertisers = new Set(
        campaigns.map(campaign => campaign.advertiser)
      ).size;
      
      return {
        metrics: {
          totalRevenue: stats.totalRevenue,
          totalClicks: stats.totalClicks,
          totalImpressions: stats.totalImpressions,
          averageCTR: stats.averageCTR,
          todayClicks: stats.todayClicks,
          activeCampaigns: stats.activeCampaigns,
          pendingCampaigns: stats.pendingCampaigns,
          activeAdvertisers: activeAdvertisers
        },
        performance: {
          averageCPC: stats.averageCPC,
          averageRPM: stats.averageRPM
        },
        trends: stats.getDailyTrends(7)
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw error;
    }
  }
}

module.exports = StatsManager;