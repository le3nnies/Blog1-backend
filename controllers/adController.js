const AdUnit = require('../models/AdUnit');
const Article = require('../models/Article');
const AdCampaign = require('../models/AdCampaign');
const AdCreative = require('../models/AdCreative');
const AdStats = require('../models/AdStats');

class AdController {
  // ===== EXISTING AD UNIT METHODS =====
  
  // Get all active ad units
  async getAdUnits(req, res) {
    try {
      const { type, position } = req.query;
      
      const query = { isActive: true };
      if (type) query.type = type;
      if (position) query.position = position;

      const adUnits = await AdUnit.find(query).sort({ createdAt: -1 });

      res.json({
        success: true,
        data: adUnits
      });
    } catch (error) {
      console.error('Get ad units error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ad units'
      });
    }
  }

  // Create new ad unit (Admin)
  async createAdUnit(req, res) {
    try {
      const {
        name,
        type,
        position,
        adCode,
        size,
        refreshRate,
        categories,
        devices
      } = req.body;

      const adUnit = new AdUnit({
        name,
        type,
        position,
        adCode,
        size,
        refreshRate: refreshRate || 30,
        categories: categories || [],
        devices: devices || ['desktop', 'mobile', 'tablet']
      });

      await adUnit.save();

      res.status(201).json({
        success: true,
        data: adUnit
      });
    } catch (error) {
      console.error('Create ad unit error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create ad unit'
      });
    }
  }

  // Update ad unit (Admin)
  async updateAdUnit(req, res) {
    try {
      const { id } = req.params;

      const adUnit = await AdUnit.findByIdAndUpdate(
        id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!adUnit) {
        return res.status(404).json({
          success: false,
          error: 'Ad unit not found'
        });
      }

      res.json({
        success: true,
        data: adUnit
      });
    } catch (error) {
      console.error('Update ad unit error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update ad unit'
      });
    }
  }

  // Delete ad unit (Admin)
  async deleteAdUnit(req, res) {
    try {
      const { id } = req.params;

      const adUnit = await AdUnit.findByIdAndDelete(id);

      if (!adUnit) {
        return res.status(404).json({
          success: false,
          error: 'Ad unit not found'
        });
      }

      res.json({
        success: true,
        message: 'Ad unit deleted successfully'
      });
    } catch (error) {
      console.error('Delete ad unit error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete ad unit'
      });
    }
  }

  // ===== AD PERFORMANCE & ANALYTICS METHODS =====

  // Get ad performance analytics
  async getAdPerformance(req, res) {
    try {
      const { period = '30d' } = req.query;
      
      const dateFilter = {};
      const now = new Date();
      
      switch (period) {
        case '7d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 7));
          break;
        case '30d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 30));
          break;
        case '90d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 90));
          break;
      }

      const performance = await AdUnit.aggregate([
        { $match: { createdAt: dateFilter } },
        {
          $group: {
            _id: '$type',
            totalImpressions: { $sum: '$impressions' },
            totalClicks: { $sum: '$clicks' },
            totalRevenue: { $sum: '$revenue' },
            averageCTR: { 
              $avg: { 
                $cond: [
                  { $eq: ['$impressions', 0] },
                  0,
                  { $multiply: [{ $divide: ['$clicks', '$impressions'] }, 100] }
                ]
              }
            },
            unitCount: { $sum: 1 }
          }
        },
        {
          $project: {
            totalImpressions: 1,
            totalClicks: 1,
            totalRevenue: 1,
            averageCTR: { $round: ['$averageCTR', 2] },
            unitCount: 1
          }
        }
      ]);

      // Get top performing ad units
      const topAdUnits = await AdUnit.find({ createdAt: dateFilter })
        .sort({ revenue: -1 })
        .limit(10)
        .select('name type impressions clicks revenue');

      res.json({
        success: true,
        data: {
          performance,
          topAdUnits
        }
      });
    } catch (error) {
      console.error('Get ad performance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ad performance'
      });
    }
  }

  // Get revenue analytics
  async getRevenueAnalytics(req, res) {
    try {
      const { period = '30d' } = req.query;
      
      const dateFilter = {};
      const now = new Date();
      
      switch (period) {
        case '7d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 7));
          break;
        case '30d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 30));
          break;
        case '90d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 90));
          break;
      }

      // Daily revenue trend
      const dailyRevenue = await AdUnit.aggregate([
        { $match: { createdAt: dateFilter } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            revenue: { $sum: '$revenue' },
            impressions: { $sum: '$impressions' },
            clicks: { $sum: '$clicks' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Revenue by article category (if available)
      const revenueByCategory = await Article.aggregate([
        { 
          $match: { 
            status: 'published',
            createdAt: dateFilter
          } 
        },
        {
          $unwind: '$adPlacements'
        },
        {
          $group: {
            _id: '$category',
            revenue: { $sum: '$adPlacements.revenue' },
            articleCount: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } }
      ]);

      const totalRevenue = dailyRevenue.reduce((sum, day) => sum + day.revenue, 0);
      const totalImpressions = dailyRevenue.reduce((sum, day) => sum + day.impressions, 0);
      const totalClicks = dailyRevenue.reduce((sum, day) => sum + day.clicks, 0);
      const averageCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

      res.json({
        success: true,
        data: {
          summary: {
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            totalImpressions,
            totalClicks,
            averageCTR: parseFloat(averageCTR.toFixed(2)),
            rpm: totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0
          },
          dailyRevenue,
          revenueByCategory
        }
      });
    } catch (error) {
      console.error('Get revenue analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch revenue analytics'
      });
    }
  }

  // Get ad analytics
  async getAdAnalytics(req, res) {
    try {
      const { period = '7d' } = req.query;

      const dateFilter = {};
      const now = new Date();
      
      switch (period) {
        case '7d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 7));
          break;
        case '30d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 30));
          break;
        case '90d':
          dateFilter.$gte = new Date(now.setDate(now.getDate() - 90));
          break;
      }

      // Get ad units performance
      const adUnits = await AdUnit.find({
        createdAt: dateFilter
      }).sort({ revenue: -1 });

      // Calculate totals
      const totals = adUnits.reduce((acc, unit) => ({
        impressions: acc.impressions + unit.impressions,
        clicks: acc.clicks + unit.clicks,
        revenue: acc.revenue + unit.revenue
      }), { impressions: 0, clicks: 0, revenue: 0 });

      // Calculate CTR
      const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

      res.json({
        success: true,
        data: {
          totals: {
            ...totals,
            ctr: parseFloat(ctr.toFixed(2))
          },
          adUnits
        }
      });
    } catch (error) {
      console.error('Get ad analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ad analytics'
      });
    }
  }

  // ===== TRACKING METHODS =====

  // Track ad impression
  async trackImpression(req, res) {
    try {
      const { adUnitId } = req.params;
      const { articleId } = req.body;

      const adUnit = await AdUnit.findById(adUnitId);
      if (!adUnit || !adUnit.isActive) {
        return res.status(404).json({
          success: false,
          error: 'Ad unit not found or inactive'
        });
      }

      // Update ad unit stats
      adUnit.impressions += 1;
      adUnit.revenue += 0.002; // $2 RPM
      await adUnit.save();

      // If associated with an article, update article ad revenue
      if (articleId) {
        await Article.updateOne(
          { 
            _id: articleId,
            'adPlacements.adUnitId': adUnitId 
          },
          {
            $inc: {
              'adPlacements.$.impressions': 1,
              'adPlacements.$.revenue': 0.002
            }
          }
        );
      }

      res.json({
        success: true,
        message: 'Impression tracked'
      });
    } catch (error) {
      console.error('Track impression error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to track impression'
      });
    }
  }

  // Track ad click
  async trackClick(req, res) {
    try {
      const { adUnitId } = req.params;
      const { articleId } = req.body;

      const adUnit = await AdUnit.findById(adUnitId);
      if (!adUnit || !adUnit.isActive) {
        return res.status(404).json({
          success: false,
          error: 'Ad unit not found or inactive'
        });
      }

      // Update ad unit stats
      adUnit.clicks += 1;
      adUnit.revenue += 0.15; // $0.15 per click
      await adUnit.save();

      // If associated with an article, update article ad revenue
      if (articleId) {
        await Article.updateOne(
          { 
            _id: articleId,
            'adPlacements.adUnitId': adUnitId 
          },
          {
            $inc: {
              'adPlacements.$.clicks': 1,
              'adPlacements.$.revenue': 0.15
            }
          }
        );
      }

      res.json({
        success: true,
        message: 'Click tracked'
      });
    } catch (error) {
      console.error('Track click error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to track click'
      });
    }
  }
}

module.exports = new AdController();