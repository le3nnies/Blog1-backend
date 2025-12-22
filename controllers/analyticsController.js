// controllers/analyticsController.js
const Article = require('../models/Article');
const PageView = require('../models/PageView');
const Session = require('../models/Session');
const Event = require('../models/Event');
const User = require('../models/User');
const { format, subDays, startOfDay, endOfDay, eachDayOfInterval, differenceInDays } = require('date-fns');

class AnalyticsController {
  // ==================== MAIN ANALYTICS METHODS ====================

  // Get comprehensive analytics data
  async getAnalytics(req, res) {
    try {
      console.log('Analytics API called with:', req.query);
      
      const { startDate, endDate, category, period = '30d' } = req.query;

      // Build date filter
      let dateFilter = {};

      // Set date range
      let fromDate, toDate;

      if (startDate && endDate) {
        fromDate = startOfDay(new Date(startDate));
        toDate = endOfDay(new Date(endDate));
      } else {
        toDate = endOfDay(new Date());

        switch (period) {
          case '1d':
            fromDate = startOfDay(subDays(toDate, 1));
            break;
          case '7d':
            fromDate = startOfDay(subDays(toDate, 7));
            break;
          case '30d':
            fromDate = startOfDay(subDays(toDate, 30));
            break;
          case '90d':
            fromDate = startOfDay(subDays(toDate, 90));
            break;
          case '1y':
            fromDate = startOfDay(subDays(toDate, 365));
            break;
          default:
            fromDate = startOfDay(subDays(toDate, 30));
        }
      }

      dateFilter = { createdAt: { $gte: fromDate, $lte: toDate } };

      // Calculate previous period dates for comparison
      const periodDuration = differenceInDays(toDate, fromDate);
      const previousFromDate = startOfDay(subDays(fromDate, periodDuration));
      const previousToDate = startOfDay(subDays(toDate, periodDuration));
      const categoryFilter = category ? { category } : {};

      // Get all data in parallel
      const [
        totalViews,
        uniqueVisitors,
        totalArticles,
        previousTotalArticles,
        sessionStats,
        engagementAggregation,
        previousEngagementAggregation,
        trafficSources,
        topArticles,
        categoryStats,
        dailyData,
        deviceData,
        deviceBrands,
        screenResolutions,
        deviceCategories,
        articleStats,
        visitorStats,
        geoCountries,
        geoCities,
        geoRegions,
        geoContinents
      ] = await Promise.all([
        // Total page views
        PageView.countDocuments(dateFilter),

        // Unique visitors
        PageView.distinct('sessionId', dateFilter).then(ids => ids.length),
        
        // Total articles (all published articles, not filtered by date range)
        Article.countDocuments({
          status: 'published',
          ...categoryFilter
        }),

        // Previous period total articles for comparison (all published articles up to previous period)
        Article.countDocuments({
          status: 'published',
          ...categoryFilter,
          publishedAt: { $lte: previousToDate }
        }),

        // Session stats
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: null,
              avgDuration: { $avg: '$duration' },
              totalSessions: { $sum: 1 },
              avgPageViews: { $avg: '$pageViewCount' },
              bounceSessions: { $sum: { $cond: [{ $eq: ['$pageViewCount', 1] }, 1, 0] } }
            }
          }
        ]),
        
        // Engagement
        Event.aggregate([
          { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 }
            }
          }
        ]),

        // Previous period engagement for comparison
        Event.aggregate([
          { $match: { createdAt: { $gte: previousFromDate, $lte: previousToDate } } },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 }
            }
          }
        ]),
        
        // Traffic sources
        PageView.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: {
                $cond: {
                  if: { $or: [{ $eq: ['$source', null] }, { $eq: ['$source', ''] }, { $eq: ['$source', 'none'] }] },
                  then: 'direct',
                  else: '$source'
                }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),
        
        // Top articles
        Article.find({
          status: 'published',
          publishedAt: { $gte: fromDate, $lte: toDate }
        })
        .sort({ views: -1 })
        .limit(10)
        .populate('author', 'name username')
        .select('title slug category views likes comments shares publishedAt')
        .lean(),
        
        // Category stats
        Article.aggregate([
          { 
            $match: { 
              status: 'published',
              publishedAt: { $gte: fromDate, $lte: toDate }
            } 
          },
          {
            $group: {
              _id: '$category',
              totalViews: { $sum: '$views' },
              articleCount: { $sum: 1 },
              totalLikes: { $sum: { $size: '$likes' } },
              totalComments: { $sum: { $size: '$comments' } },
              totalShares: { $sum: '$shares' }
            }
          },
          {
            $project: {
              category: '$_id',
              views: '$totalViews',
              articles: '$articleCount',
              likes: '$totalLikes',
              comments: '$totalComments',
              shares: '$totalShares'
            }
          },
          { $sort: { views: -1 } }
        ]),
        
        // Daily data - using MongoDB aggregation for better performance
        PageView.aggregate([
          { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              views: { $sum: 1 },
              uniqueSessions: { $addToSet: '$sessionId' }
            }
          },
          {
            $project: {
              date: '$_id',
              views: 1,
              uniqueVisitors: { $size: '$uniqueSessions' },
              formattedDate: {
                $dateToString: { format: '%b %d', date: { $dateFromString: { dateString: '$_id' } } }
              }
            }
          },
          { $sort: { date: 1 } }
        ]).then(results => {
          // Fill in missing dates with zero values
          const days = eachDayOfInterval({ start: fromDate, end: toDate });
          const resultsMap = new Map(results.map(item => [item.date, item]));

          return days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const existing = resultsMap.get(dateStr);

            return existing || {
              date: dateStr,
              views: 0,
              uniqueVisitors: 0,
              formattedDate: format(day, 'MMM dd')
            };
          });
        }).catch(error => {
          console.error('Daily data aggregation error:', error);
          // Fallback to manual implementation
          const days = eachDayOfInterval({ start: fromDate, end: toDate });
          return days.map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            views: 0,
            uniqueVisitors: 0,
            formattedDate: format(day, 'MMM dd')
          }));
        }),
        
        // Device data - enhanced with detailed breakdowns
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: '$deviceType',
              count: { $sum: 1 },
              avgDuration: { $avg: '$duration' },
              brands: {
                $push: {
                  brand: '$deviceBrand',
                  model: '$deviceModel',
                  screenResolution: '$screenResolution'
                }
              }
            }
          },
          { $sort: { count: -1 } }
        ]),

        // Detailed device breakdown by brand
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate }, deviceBrand: { $ne: null, $ne: 'Unknown' } } },
          {
            $group: {
              _id: '$deviceBrand',
              count: { $sum: 1 },
              avgDuration: { $avg: '$duration' },
              deviceTypes: { $addToSet: '$deviceType' },
              models: { $addToSet: '$deviceModel' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),

        // Screen resolution breakdown
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate }, screenResolution: { $ne: null } } },
          {
            $group: {
              _id: '$screenResolution',
              count: { $sum: 1 },
              avgDuration: { $avg: '$duration' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),

        // Device category breakdown
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: '$deviceCategory',
              count: { $sum: 1 },
              avgDuration: { $avg: '$duration' }
            }
          },
          { $sort: { count: -1 } }
        ]),
        
        // Article stats
        Article.aggregate([
          { $match: { status: 'published', ...categoryFilter } },
          {
            $group: {
              _id: null,
              avgReadTime: { $avg: '$avgReadTime' },
              totalBookmarks: { $sum: '$bookmarks' }
            }
          }
        ]),
        
        // Visitor stats
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: '$isNewVisitor',
              count: { $sum: 1 }
            }
          }
        ]),

        // Geographic data - countries
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate }, country: { $ne: null } } },
          {
            $group: {
              _id: { country: '$country' },
              count: { $sum: 1 },
              totalViews: { $sum: '$pageCount' },
              avgDuration: { $avg: '$duration' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 20 }
        ]),

        // Geographic data - cities
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate }, city: { $ne: null, $ne: 'Unknown' } } },
          {
            $group: {
              _id: { city: '$city', country: '$country', countryCode: '$countryCode' },
              count: { $sum: 1 },
              totalViews: { $sum: '$pageCount' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 20 }
        ]),

        // Geographic data - regions
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate }, region: { $ne: null, $ne: 'Unknown' } } },
          {
            $group: {
              _id: { region: '$region', country: '$country', countryCode: '$countryCode' },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 20 }
        ]),

        // Geographic data - continents
        Session.aggregate([
          { $match: { endTime: { $gte: fromDate, $lte: toDate }, continent: { $ne: null, $ne: 'Unknown' } } },
          {
            $group: {
              _id: '$continent',
              count: { $sum: 1 },
              uniqueCountries: { $addToSet: '$countryCode' }
            }
          },
          {
            $project: {
              continent: '$_id',
              count: 1,
              uniqueCountries: { $size: '$uniqueCountries' }
            }
          },
          { $sort: { count: -1 } }
        ])
      ]);

      // Process engagement counts
      let totalLikes = 0, totalComments = 0, totalShares = 0, totalBookmarks = 0;
      engagementAggregation.forEach(item => {
        if (item._id === 'like') totalLikes = item.count;
        if (item._id === 'comment') totalComments = item.count;
        if (item._id === 'share') totalShares = item.count;
        if (item._id === 'bookmark') totalBookmarks = item.count;
      });

      // Process previous period engagement counts
      let previousTotalLikes = 0, previousTotalComments = 0, previousTotalShares = 0, previousTotalBookmarks = 0;
      previousEngagementAggregation.forEach(item => {
        if (item._id === 'like') previousTotalLikes = item.count;
        if (item._id === 'comment') previousTotalComments = item.count;
        if (item._id === 'share') previousTotalShares = item.count;
        if (item._id === 'bookmark') previousTotalBookmarks = item.count;
      });

      // Calculate derived metrics
      const avgSessionDuration = sessionStats[0] ? Math.round(sessionStats[0].avgDuration) : 0;
      const avgPagesPerSession = sessionStats[0] ? Math.round(sessionStats[0].avgPageViews) : 0;
      const bounceRate = sessionStats[0] && sessionStats[0].totalSessions > 0 
        ? Math.round((sessionStats[0].bounceSessions / sessionStats[0].totalSessions) * 100) 
        : 0;

      const newVisitors = visitorStats.find(v => v._id === true)?.count || 0;
      const returningVisitors = visitorStats.find(v => v._id === false)?.count || 0;

      // Calculate change percentages
      const calculateChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      // Insights will be loaded asynchronously via separate endpoint
      // This prevents blocking the main analytics page load

      // Prepare graph data for overview
      const engagementTrends = await (async () => {
        try {
          const engagementByDate = await Event.aggregate([
            { $match: { createdAt: { $gte: fromDate, $lte: toDate } } },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                },
                likes: { $sum: { $cond: [{ $eq: ['$type', 'like'] }, 1, 0] } },
                comments: { $sum: { $cond: [{ $eq: ['$type', 'comment'] }, 1, 0] } },
                shares: { $sum: { $cond: [{ $eq: ['$type', 'share'] }, 1, 0] } },
                bookmarks: { $sum: { $cond: [{ $eq: ['$type', 'bookmark'] }, 1, 0] } }
              }
            },
            { $sort: { '_id': 1 } }
          ]);

          const engagementMap = new Map(engagementByDate.map(item => [item._id, item]));
          return dailyData.map(day => {
            const engagement = engagementMap.get(day.date);
            return {
              date: day.date,
              likes: engagement?.likes || 0,
              comments: engagement?.comments || 0,
              shares: engagement?.shares || 0,
              bookmarks: engagement?.bookmarks || 0
            };
          });
        } catch (error) {
          console.error('Engagement trends error:', error);
          return dailyData.map(day => ({
            date: day.date,
            likes: 0,
            comments: 0,
            shares: 0,
            bookmarks: 0
          }));
        }
      })();

      // Structured graph data for overview
      const graphs = {
        viewsOverTime: {
          data: dailyData,
          title: 'Views Over Time',
          description: 'Daily page views for the selected period'
        },
        trafficSources: {
          data: trafficSources.map(source => ({
            name: source._id || 'direct',
            value: source.count
          })),
          title: 'Traffic Sources',
          description: 'Where your visitors come from'
        },
        topArticles: {
          data: topArticles.slice(0, 5).map(article => ({
            title: article.title,
            views: article.views
          })),
          title: 'Top Articles Performance',
          description: 'Most viewed articles'
        },
        deviceTypes: {
          data: deviceData.map(device => ({
            device: device._id || 'unknown',
            sessions: device.count,
            percentage: Math.round((device.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            avgDuration: Math.round((device.avgDuration || 0) / 60)
          })),
          title: 'Device Types',
          description: 'Visitor device preferences'
        },
        engagementTrends: {
          data: engagementTrends,
          title: 'Engagement Trends',
          description: 'Daily engagement metrics over time'
        }
      };

      // Compile response
      const analyticsData = {
        totalViews,
        totalArticles,
        totalUsers: uniqueVisitors,
        avgSessionDuration: Math.round(avgSessionDuration),
        totalLikes,
        totalComments,
        totalBookmarks,
        overview: {
          totalViews,
          totalUsers: uniqueVisitors,
          totalArticles,
          avgSessionDuration: Math.round(avgSessionDuration),
          avgPagesPerSession,
          bounceRate,
          newVisitors,
          returningVisitors,
          totalSessions: sessionStats[0]?.totalSessions || 0
        },
        comparison: {
          previousTotalArticles,
          totalArticlesChange: calculateChange(totalArticles, previousTotalArticles)
        },
        content: {
          topArticles: topArticles.map(article => ({
            id: article._id.toString(),
            title: article.title,
            views: article.views,
            category: article.category,
            publishedAt: article.publishedAt,
            likes: article.likes?.length || 0
          }))
        },
        categoryStats: categoryStats.map(cat => ({
          category: cat.category,
          views: cat.views,
          articles: cat.articles
        })),
        userEngagement: [
          { metric: 'Likes', value: totalLikes, change: calculateChange(totalLikes, previousTotalLikes) },
          { metric: 'Comments', value: totalComments, change: calculateChange(totalComments, previousTotalComments) },
          { metric: 'Bookmarks', value: totalBookmarks, change: calculateChange(totalBookmarks, previousTotalBookmarks) }
        ],
        devices: {
          types: deviceData.map(device => ({
            device: device._id || 'unknown',
            sessions: device.count,
            percentage: Math.round((device.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            avgDuration: Math.round((device.avgDuration || 0) / 60)
          })),
          brands: deviceBrands.map(brand => ({
            brand: brand._id,
            sessions: brand.count,
            percentage: Math.round((brand.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            avgDuration: Math.round((brand.avgDuration || 0) / 60),
            deviceTypes: brand.deviceTypes,
            models: brand.models
          })),
          screenResolutions: screenResolutions.map(res => ({
            resolution: res._id,
            sessions: res.count,
            percentage: Math.round((res.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            avgDuration: Math.round((res.avgDuration || 0) / 60)
          })),
          categories: deviceCategories.map(category => ({
            category: category._id || 'unknown',
            sessions: category.count,
            percentage: Math.round((category.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            avgDuration: Math.round((category.avgDuration || 0) / 60)
          }))
        },
        geographic: {
          countries: geoCountries.filter(country => country._id && country._id.country).map(country => ({
            country: country._id.country,
            sessions: country.count,
            percentage: Math.round((country.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            views: country.totalViews,
            avgDuration: Math.round(country.avgDuration || 0)
          })),
          cities: geoCities.map(city => ({
            city: city._id.city,
            country: city._id.country,
            sessions: city.count,
            percentage: Math.round((city.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            views: city.totalViews
          })),
          regions: geoRegions.map(region => ({
            region: region._id.region,
            country: region._id.country,
            sessions: region.count,
            percentage: Math.round((region.count / (sessionStats[0]?.totalSessions || 1)) * 100)
          })),
          continents: geoContinents.map(continent => ({
            continent: continent._id,
            sessions: continent.count,
            percentage: Math.round((continent.count / (sessionStats[0]?.totalSessions || 1)) * 100),
            countries: continent.uniqueCountries
          })),
          topLocations: [
            ...geoCountries.filter(country => country._id && country._id.country).slice(0, 5).map(country => ({
              location: country._id.country,
              type: 'country',
              sessions: country.count,
              percentage: Math.round((country.count / (sessionStats[0]?.totalSessions || 1)) * 100)
            })),
            ...geoCities.filter(city => city._id && city._id.city).slice(0, 5).map(city => ({
              location: city._id.city,
              type: 'city',
              sessions: city.count,
              percentage: Math.round((city.count / (sessionStats[0]?.totalSessions || 1)) * 100)
            }))
          ].sort((a, b) => b.sessions - a.sessions).slice(0, 10)
        },
        // New structured graphs section for overview
        graphs
      };

      res.json({
        success: true,
        data: analyticsData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics data',
        message: error.message
      });
    }
  }



  // Get daily traffic data
  async getDailyTrafficData(fromDate, toDate) {
    try {
      const days = eachDayOfInterval({ start: fromDate, end: toDate });
      
      // Get page views for the period
      const pageViews = await PageView.find({
        createdAt: { $gte: fromDate, $lte: toDate }
      }).select('createdAt sessionId').lean();
      
      // Group by day
      const dailyStats = {};
      pageViews.forEach(view => {
        const dateStr = format(new Date(view.createdAt), 'yyyy-MM-dd');
        if (!dailyStats[dateStr]) {
          dailyStats[dateStr] = {
            views: 0,
            uniqueSessions: new Set()
          };
        }
        dailyStats[dateStr].views++;
        if (view.sessionId) {
          dailyStats[dateStr].uniqueSessions.add(view.sessionId.toString());
        }
      });
      
      // Format results
      return days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const stats = dailyStats[dateStr];
        
        return {
          date: dateStr,
          views: stats ? stats.views : 0,
          uniqueVisitors: stats ? stats.uniqueSessions.size : 0,
          formattedDate: format(day, 'MMM dd')
        };
      });
      
    } catch (error) {
      console.error('Daily traffic data error:', error);
      const days = eachDayOfInterval({ start: fromDate, end: toDate });
      return days.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        views: 0,
        uniqueVisitors: 0,
        formattedDate: format(day, 'MMM dd')
      }));
    }
  }

  // Get real-time analytics
  async getRealTimeAnalytics(req, res) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [
        activeSessions,
        recentPageViews,
        currentVisitors,
        avgSessionDuration,
        topPages,
        homepageViews
      ] = await Promise.all([
        // Active sessions (sessions that started in last hour and haven't ended)
        Session.countDocuments({
          startTime: { $gte: oneHourAgo },
          endTime: null
        }),

        // Page views in last hour
        PageView.countDocuments({
          createdAt: { $gte: oneHourAgo }
        }),

        // Current active users (unique sessions in last hour)
        PageView.distinct('sessionId', {
          createdAt: { $gte: oneHourAgo }
        }).then(ids => ids.length),

        // Average session duration for completed sessions in the last hour
        Session.aggregate([
          { $match: {
            endTime: { $gte: oneHourAgo },
            duration: { $exists: true, $gt: 0 }
          }},
          {
            $group: {
              _id: null,
              avgDuration: { $avg: '$duration' },
              totalSessions: { $sum: 1 }
            }
          }
        ]).then(result => Math.round(result[0]?.avgDuration || 0)),

        // Top pages by views in last hour (including homepage)
        PageView.aggregate([
          { $match: { createdAt: { $gte: oneHourAgo } } },
          {
            $group: {
              _id: { $ifNull: ['$articleId', 'homepage'] },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),

        // Homepage views (assuming homepage is when articleId is null or specific identifier)
        PageView.countDocuments({
          createdAt: { $gte: oneHourAgo },
          $or: [
            { articleId: null },
            { pageUrl: { $regex: '^/?$' } }, // Root path or homepage
            { pageUrl: { $regex: '/$' } } // Root with trailing slash
          ]
        })
      ]);

      // Get article details for top pages (filter out non-ObjectId entries like "homepage")
      const topPageIds = topPages.map(page => page._id).filter(id => id && id !== 'homepage');
      const articles = topPageIds.length > 0 ? await Article.find({ _id: { $in: topPageIds } })
        .select('title slug category')
        .lean() : [];

      const realTimeData = {
        activeUsers: currentVisitors, // Active users (unique sessions)
        currentViews: recentPageViews, // Current views (page views in last hour)
        avgTime: Math.round(avgSessionDuration / 60), // Average time in minutes
        homepageViews: homepageViews, // Homepage views
        activeSessions, // Active sessions count
        topPages: topPages.map(page => {
          const article = articles.find(a => a._id.toString() === page._id.toString());
          return {
            articleId: page._id,
            views: page.count,
            title: article?.title || 'Homepage',
            slug: article?.slug || '/',
            category: article?.category || 'homepage',
            isHomepage: !article // Flag for homepage
          };
        }),
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: realTimeData
      });

    } catch (error) {
      console.error('Real-time analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch real-time analytics'
      });
    }
  }

  // Get article-specific analytics
  async getArticleAnalytics(req, res) {
    try {
      const { articleId } = req.params;
      const { startDate, endDate } = req.query;

      const article = await Article.findById(articleId)
        .populate('author', 'name email')
        .lean();

      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = { 
          $gte: startOfDay(new Date(startDate)), 
          $lte: endOfDay(new Date(endDate)) 
        };
      }

      // Get article data
      const [pageViews, engagementEvents, dailyStats] = await Promise.all([
        PageView.find({ articleId, ...dateFilter }).sort({ createdAt: -1 }).limit(100),
        Event.find({ articleId, ...dateFilter }).sort({ createdAt: -1 }),
        PageView.aggregate([
          { $match: { articleId, ...dateFilter } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              views: { $sum: 1 },
              uniqueVisitors: { $addToSet: '$sessionId' }
            }
          },
          {
            $project: {
              date: '$_id',
              views: 1,
              uniqueVisitors: { $size: '$uniqueVisitors' }
            }
          },
          { $sort: { date: 1 } }
        ])
      ]);

      const articleAnalytics = {
        article: {
          title: article.title,
          slug: article.slug,
          category: article.category,
          author: article.author,
          publishedAt: article.publishedAt
        },
        metrics: {
          totalViews: article.views || 0,
          likes: article.likes?.length || 0,
          comments: article.comments?.length || 0,
          shares: article.shares || 0,
          bookmarks: article.bookmarks || 0,
          avgReadTime: article.avgReadTime || 0
        },
        timeSeries: dailyStats,
        recentActivity: {
          pageViews: pageViews.slice(0, 10),
          engagementEvents: engagementEvents.slice(0, 10)
        }
      };

      res.json({
        success: true,
        data: articleAnalytics
      });

    } catch (error) {
      console.error('Article analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch article analytics'
      });
    }
  }

  // ==================== OTHER ROUTE METHODS ====================

  // Get reader behavior
  async getReaderBehavior(req, res) {
    try {
      res.json({
        success: true,
        data: { message: 'Reader behavior endpoint' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch reader behavior'
      });
    }
  }

  // Generate report
  async generateReport(req, res) {
    try {
      res.json({
        success: true,
        data: { message: 'Report generation endpoint' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate report'
      });
    }
  }

  // Export data
  async exportData(req, res) {
    try {
      res.json({
        success: true,
        data: { message: 'Data export endpoint' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to export data'
      });
    }
  }

  // Get dashboard stats
  async getDashboardStats(req, res) {
    try {
      const { period = '7d' } = req.query;

      let dateFilter = {};
      let periodLabel = 'All Time';

      if (period !== 'all') {
        const toDate = endOfDay(new Date());
        const fromDate = startOfDay(subDays(toDate, parseInt(period.replace('d', '')) || 7));
        dateFilter = { createdAt: { $gte: fromDate, $lte: toDate } };
        periodLabel = `${format(fromDate, 'MMM dd')} - ${format(toDate, 'MMM dd')}`;
      }

      const [totalViews, uniqueVisitors, totalArticles] = await Promise.all([
        // For 'all' period, sum Article.views; otherwise count PageView documents
        period === 'all'
          ? Article.aggregate([
              { $match: { status: 'published' } },
              { $group: { _id: null, totalViews: { $sum: '$views' } } }
            ]).then(result => result[0]?.totalViews || 0)
          : PageView.countDocuments(dateFilter),
        PageView.distinct('sessionId', dateFilter).then(ids => ids.length),
        Article.countDocuments({
          status: 'published'
        })
      ]);

      res.json({
        success: true,
        data: {
          totalViews,
          uniqueVisitors,
          totalArticles,
          period: periodLabel
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dashboard stats'
      });
    }
  }

  // Get revenue breakdown
  async getRevenueBreakdown(req, res) {
    try {
      res.json({
        success: true,
        data: { message: 'Revenue breakdown endpoint' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch revenue breakdown'
      });
    }
  }

  // Get user engagement
  async getUserEngagement(req, res) {
    try {
      res.json({
        success: true,
        data: { message: 'User engagement endpoint' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user engagement'
      });
    }
  }

  // Get analytics overview
  async getAnalyticsOverview(req, res) {
    try {
      res.json({
        success: true,
        data: { message: 'Analytics overview endpoint' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics overview'
      });
    }
  }

  // Get realtime metrics for dashboard
  async getRealtimeMetrics(req, res) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [
        activeUsers,
        currentViews,
        avgSessionDuration,
        topPages
      ] = await Promise.all([
        // Current active users (unique sessions in last hour)
        PageView.distinct('sessionId', {
          createdAt: { $gte: oneHourAgo }
        }).then(ids => ids.length),

        // Page views in last hour
        PageView.countDocuments({
          createdAt: { $gte: oneHourAgo }
        }),

        // Average session duration for completed sessions in the last hour
        Session.aggregate([
          { $match: {
            endTime: { $gte: oneHourAgo },
            duration: { $exists: true, $gt: 0 }
          }},
          {
            $group: {
              _id: null,
              avgDuration: { $avg: '$duration' },
              totalSessions: { $sum: 1 }
            }
          }
        ]).then(result => Math.round(result[0]?.avgDuration || 0)),

        // Top page by views in last hour
        PageView.aggregate([
          { $match: { createdAt: { $gte: oneHourAgo } } },
          {
            $group: {
              _id: { $ifNull: ['$articleId', 'homepage'] },
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 1 }
        ])
      ]);

      // Get article title for top page if it's not homepage
      let topPageTitle = 'Homepage';
      if (topPages.length > 0 && topPages[0]._id !== 'homepage') {
        const article = await Article.findById(topPages[0]._id).select('title').lean();
        if (article) {
          topPageTitle = article.title;
        }
      }

      const realtimeData = {
        activeUsers,
        currentViews,
        topPage: topPageTitle,
        avgSessionTime: Math.round(avgSessionDuration / 60) // Convert to minutes
      };

      res.json({
        success: true,
        data: realtimeData
      });

    } catch (error) {
      console.error('Realtime metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch realtime metrics'
      });
    }
  }

  // Get total views
  async getTotalViews(req, res) {
    try {
      const { startDate, endDate } = req.query;

      let dateFilter = {};

      if (startDate && endDate) {
        const fromDate = startOfDay(new Date(startDate));
        const toDate = endOfDay(new Date(endDate));
        dateFilter = { createdAt: { $gte: fromDate, $lte: toDate } };
      }
      // If no dates provided, count all views (all-time total)

      const totalViews = await PageView.countDocuments(dateFilter);

      res.json({
        success: true,
        data: { totalViews }
      });
    } catch (error) {
      console.error('Total views error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch total views'
      });
    }
  }

  // Get comments analytics
  async getCommentsAnalytics(req, res) {
    try {
      const { startDate, endDate, period = '30d' } = req.query;

      // Build date filter
      let dateFilter = {};

      // Set date range
      let fromDate, toDate;

      if (startDate && endDate) {
        fromDate = startOfDay(new Date(startDate));
        toDate = endOfDay(new Date(endDate));
      } else {
        toDate = endOfDay(new Date());

        switch (period) {
          case '1d':
            fromDate = startOfDay(subDays(toDate, 1));
            break;
          case '7d':
            fromDate = startOfDay(subDays(toDate, 7));
            break;
          case '30d':
            fromDate = startOfDay(subDays(toDate, 30));
            break;
          case '90d':
            fromDate = startOfDay(subDays(toDate, 90));
            break;
          case '1y':
            fromDate = startOfDay(subDays(toDate, 365));
            break;
          default:
            fromDate = startOfDay(subDays(toDate, 30));
        }
      }

      dateFilter = { createdAt: { $gte: fromDate, $lte: toDate } };

      // Get comments data
      const [
        totalComments,
        commentsByDate,
        topCommentedArticles,
        commentsByCategory,
        commentsByHour,
        commentsByDayOfWeek,
        avgCommentsPerArticle,
        commentEngagement
      ] = await Promise.all([
        // Total comments in period
        Article.aggregate([
          { $match: { status: 'published' } },
          { $unwind: '$comments' },
          { $match: { 'comments.createdAt': { $gte: fromDate, $lte: toDate } } },
          { $count: 'totalComments' }
        ]).then(result => result[0]?.totalComments || 0),

        // Comments by date
        Article.aggregate([
          { $match: { status: 'published' } },
          { $unwind: '$comments' },
          { $match: { 'comments.createdAt': { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$comments.createdAt' }
              },
              count: { $sum: 1 },
              articles: { $addToSet: '$_id' }
            }
          },
          {
            $project: {
              date: '$_id',
              comments: '$count',
              articlesWithComments: { $size: '$articles' }
            }
          },
          { $sort: { date: 1 } }
        ]),

        // Top commented articles
        Article.aggregate([
          { $match: { status: 'published' } },
          {
            $project: {
              title: 1,
              slug: 1,
              category: 1,
              views: 1,
              commentCount: {
                $size: {
                  $filter: {
                    input: '$comments',
                    cond: {
                      $and: [
                        { $gte: ['$$this.createdAt', fromDate] },
                        { $lte: ['$$this.createdAt', toDate] }
                      ]
                    }
                  }
                }
              }
            }
          },
          { $match: { commentCount: { $gt: 0 } } },
          { $sort: { commentCount: -1 } },
          { $limit: 10 }
        ]),

        // Comments by category
        Article.aggregate([
          { $match: { status: 'published' } },
          { $unwind: '$comments' },
          { $match: { 'comments.createdAt': { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: '$category',
              comments: { $sum: 1 },
              articles: { $addToSet: '$_id' }
            }
          },
          {
            $project: {
              category: '$_id',
              comments: 1,
              articlesWithComments: { $size: '$articles' }
            }
          },
          { $sort: { comments: -1 } }
        ]),

        // Comments by hour of day
        Article.aggregate([
          { $match: { status: 'published' } },
          { $unwind: '$comments' },
          { $match: { 'comments.createdAt': { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: { $hour: '$comments.createdAt' },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              hour: '$_id',
              comments: '$count'
            }
          },
          { $sort: { hour: 1 } }
        ]),

        // Comments by day of week
        Article.aggregate([
          { $match: { status: 'published' } },
          { $unwind: '$comments' },
          { $match: { 'comments.createdAt': { $gte: fromDate, $lte: toDate } } },
          {
            $group: {
              _id: { $dayOfWeek: '$comments.createdAt' },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              dayOfWeek: '$_id',
              comments: '$count',
              dayName: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$_id', 1] }, then: 'Sunday' },
                    { case: { $eq: ['$_id', 2] }, then: 'Monday' },
                    { case: { $eq: ['$_id', 3] }, then: 'Tuesday' },
                    { case: { $eq: ['$_id', 4] }, then: 'Wednesday' },
                    { case: { $eq: ['$_id', 5] }, then: 'Thursday' },
                    { case: { $eq: ['$_id', 6] }, then: 'Friday' },
                    { case: { $eq: ['$_id', 7] }, then: 'Saturday' }
                  ],
                  default: 'Unknown'
                }
              }
            }
          },
          { $sort: { dayOfWeek: 1 } }
        ]),

        // Average comments per article
        Article.aggregate([
          { $match: { status: 'published' } },
          {
            $project: {
              commentCount: {
                $size: {
                  $filter: {
                    input: '$comments',
                    cond: {
                      $and: [
                        { $gte: ['$$this.createdAt', fromDate] },
                        { $lte: ['$$this.createdAt', toDate] }
                      ]
                    }
                  }
                }
              }
            }
          },
          {
            $group: {
              _id: null,
              totalComments: { $sum: '$commentCount' },
              totalArticles: { $sum: 1 },
              articlesWithComments: {
                $sum: { $cond: [{ $gt: ['$commentCount', 0] }, 1, 0] }
              }
            }
          },
          {
            $project: {
              avgCommentsPerArticle: { $divide: ['$totalComments', '$totalArticles'] },
              commentEngagementRate: { $divide: ['$articlesWithComments', '$totalArticles'] }
            }
          }
        ]).then(result => result[0] || { avgCommentsPerArticle: 0, commentEngagementRate: 0 }),

        // Comment engagement metrics
        Article.aggregate([
          { $match: { status: 'published' } },
          {
            $project: {
              views: 1,
              commentCount: {
                $size: {
                  $filter: {
                    input: '$comments',
                    cond: {
                      $and: [
                        { $gte: ['$$this.createdAt', fromDate] },
                        { $lte: ['$$this.createdAt', toDate] }
                      ]
                    }
                  }
                }
              }
            }
          },
          {
            $group: {
              _id: null,
              totalViews: { $sum: '$views' },
              totalComments: { $sum: '$commentCount' },
              articlesWithComments: {
                $sum: { $cond: [{ $gt: ['$commentCount', 0] }, 1, 0] }
              },
              totalArticles: { $sum: 1 }
            }
          },
          {
            $project: {
              commentsPerView: { $divide: ['$totalComments', { $max: ['$totalViews', 1] }] },
              commentConversionRate: { $divide: ['$articlesWithComments', '$totalArticles'] }
            }
          }
        ]).then(result => result[0] || { commentsPerView: 0, commentConversionRate: 0 })
      ]);

      // Fill in missing dates with zero comments
      const days = eachDayOfInterval({ start: fromDate, end: toDate });
      const commentsByDateMap = new Map(commentsByDate.map(item => [item.date, item]));
      const filledCommentsByDate = days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existing = commentsByDateMap.get(dateStr);
        return existing || {
          date: dateStr,
          comments: 0,
          articlesWithComments: 0
        };
      });

      const commentsAnalytics = {
        totalComments,
        commentsByDate: filledCommentsByDate,
        topCommentedArticles: topCommentedArticles.map(article => ({
          id: article._id.toString(),
          title: article.title,
          slug: article.slug,
          category: article.category,
          views: article.views,
          comments: article.commentCount
        })),
        commentsByCategory,
        commentsByHour: commentsByHour.map(item => ({
          hour: item.hour,
          comments: item.comments,
          timeLabel: `${item.hour}:00`
        })),
        commentsByDayOfWeek,
        avgCommentsPerArticle: avgCommentsPerArticle.avgCommentsPerArticle || 0,
        commentEngagementRate: avgCommentsPerArticle.commentEngagementRate || 0,
        commentEngagement: {
          commentsPerView: commentEngagement.commentsPerView || 0,
          commentConversionRate: commentEngagement.commentConversionRate || 0
        },
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          days: differenceInDays(toDate, fromDate) + 1
        }
      };

      res.json({
        success: true,
        data: commentsAnalytics
      });

    } catch (error) {
      console.error('Comments analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch comments analytics',
        message: error.message
      });
    }
  }


}

module.exports = new AnalyticsController();
