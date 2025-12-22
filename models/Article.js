const mongoose = require('mongoose');

/**
 * Schema definition for article comments
 * @typedef {Object} CommentSchema
 * @property {mongoose.Types.ObjectId} user - Reference to the user who made the comment (optional for registered users)
 * @property {mongoose.Types.ObjectId} newsletterSubscriber - Reference to newsletter subscriber who made the comment (optional for newsletter subscribers)
 * @property {string} commenterName - Display name for the commenter (extracted from email for newsletter subscribers)
 * @property {string} commenterEmail - Email of the commenter (for newsletter subscribers)
 * @property {string} content - The comment text content (max 1000 characters)
 * @property {number} likes - Number of likes the comment has received
 * @property {boolean} isApproved - Whether the comment is approved for display (default: true)
 * @property {Date} createdAt - Timestamp when comment was created
 * @property {Date} updatedAt - Timestamp when comment was last updated
 */
const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  newsletterSubscriber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Newsletter'
  },
  commenterName: {
    type: String,
    trim: true
  },
  commenterEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  likes: {
    type: Number,
    default: 0
  },
  isApproved: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

/**
 * Schema definition for advertisement placements within articles
 * @typedef {Object} AdPlacementSchema
 * @property {string} position - Position of the ad (header, sidebar, in-content, footer)
 * @property {mongoose.Types.ObjectId} adUnitId - Reference to the AdUnit model
 * @property {number} revenue - Revenue generated from this ad placement
 * @property {number} impressions - Number of times the ad was displayed
 * @property {number} clicks - Number of times the ad was clicked
 */
const adPlacementSchema = new mongoose.Schema({
  position: {
    type: String,
    required: true,
    enum: ['header', 'sidebar', 'in-content', 'footer']
  },
  adUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdUnit',
    required: true
  },
  revenue: {
    type: Number,
    default: 0
  },
  impressions: {
    type: Number,
    default: 0
  },
  clicks: {
    type: Number,
    default: 0
  }
});

/**
 * Mongoose schema for Article model
 * Defines the structure and behavior of blog articles in the system
 * @typedef {Object} ArticleSchema
 * @property {string} title - Article title (required, max 200 chars, trimmed)
 * @property {string} content - Full article content in HTML/markdown (required)
 * @property {string} excerpt - Short summary of the article (max 1000 chars)
 * @property {string} slug - URL-friendly identifier (unique, required)
 * @property {string} featuredImage - URL to the featured image
 * @property {string} category - Article category (required, indexed)
 * @property {string[]} tags - Array of tags associated with the article
 * @property {mongoose.Types.ObjectId} author - Reference to the User who wrote the article (required)
 * @property {number} views - Total number of views (default: 0)
 * @property {mongoose.Types.ObjectId[]} likes - Array of user IDs who liked the article
 * @property {number} likesCount - Cached count of likes (default: 0)
 * @property {number} commentCount - Cached count of comments (default: 0)
 * @property {number} shares - Total number of shares (default: 0)
 * @property {number} bookmarks - Total number of bookmarks (default: 0)
 * @property {number} totalReadTime - Total time spent reading across all views (default: 0)
 * @property {number} avgReadTime - Average time spent reading per view (default: 0)
 * @property {number} bounceCount - Number of bounce views (default: 0)
 * @property {Object[]} scrollDepth - Array of scroll depth tracking objects
 * @property {Object} trafficSources - Breakdown of traffic sources
 * @property {Object[]} dailyStats - Daily analytics data for trend analysis
 * @property {number} trendingScore - Calculated trending score (default: 0)
 * @property {number} readTime - Estimated reading time in minutes
 * @property {string} metaTitle - SEO meta title (max 200 chars)
 * @property {string} metaDescription - SEO meta description (max 300 chars)
 * @property {string} status - Publication status (draft/published/scheduled/archived, default: draft)
 * @property {Date} publishedAt - Date when article was published
 * @property {Date} scheduledFor - Date when article is scheduled to be published
 * @property {AdPlacementSchema[]} adPlacements - Array of advertisement placements
 * @property {number} readCompletionRate - Percentage of article read on average (default: 0)
 * @property {Object} socialShares - Social media share counts
 * @property {Date} createdAt - Timestamp when article was created
 * @property {Date} updatedAt - Timestamp when article was last updated
 */
const articleSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  content: { 
    type: String, 
    required: true 
  },
  excerpt: { 
    type: String,
    maxlength: 1000
  },
  slug: { 
    type: String, 
    unique: true, 
    required: true 
  },
  featuredImage: { 
    type: String 
  },
  category: { 
    type: String, 
    required: true,
    index: true
  },
  tags: [{ 
    type: String,
    trim: true
  }],
  author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  
  // Engagement metrics (updated)
  views: { 
    type: Number, 
    default: 0 
  },
  likes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  commentCount: {
    type: Number,
    default: 0
  },
  shares: {
    type: Number, 
    default: 0 
  },
  bookmarks: { 
    type: Number, 
    default: 0 
  },
  
  // New analytics fields
  totalReadTime: { 
    type: Number, 
    default: 0 
  },
  avgReadTime: { 
    type: Number, 
    default: 0 
  },
  bounceCount: { 
    type: Number, 
    default: 0 
  },
  scrollDepth: [{
    depth: { type: Number, required: true }, // 25, 50, 75, 100
    count: { type: Number, default: 0 }
  }],
  trafficSources: {
    direct: { type: Number, default: 0 },
    google: { type: Number, default: 0 },
    social: { type: Number, default: 0 },
    referral: { type: Number, default: 0 },
    email: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  
  // Daily stats for trend analysis
  dailyStats: [{
    date: { type: Date, required: true },
    views: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    avgTimeOnPage: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 }
  }],
  
  // Trending scoring
  trendingScore: { 
    type: Number, 
    default: 0 
  },
  readTime: { 
    type: Number 
  },
  
  // SEO
  metaTitle: { 
    type: String,
    maxlength: 200
  },
  metaDescription: { 
    type: String,
    maxlength: 300
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['draft', 'published', 'scheduled', 'archived'], 
    default: 'draft' 
  },
  publishedAt: { 
    type: Date 
  },
  scheduledFor: { 
    type: Date 
  },
  
  // Comments
  comments: [commentSchema],

  // Monetization
  adPlacements: [adPlacementSchema],

  // Analytics
  readCompletionRate: {
    type: Number,
    default: 0
  },
  socialShares: {
    facebook: { type: Number, default: 0 },
    twitter: { type: Number, default: 0 },
    linkedin: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ category: 1, publishedAt: -1 });
articleSchema.index({ trendingScore: -1 });
articleSchema.index({ author: 1, publishedAt: -1 });
articleSchema.index({ tags: 1 });
articleSchema.index({ views: -1 });
articleSchema.index({ likesCount: -1 });

/**
 * Virtual property for engagement rate
 * @returns {number} The engagement rate as a percentage (likes + comments + shares + bookmarks) / views * 100
 */
articleSchema.virtual('engagementRate').get(function() {
  if (this.views === 0) return 0;
  const totalEngagement = this.likesCount + this.commentCount + this.shares + this.bookmarks;
  return (totalEngagement / this.views) * 100;
});

// Calculate read time before save
articleSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    const wordsPerMinute = 200;
    const wordCount = this.content.split(/\s+/).length;
    this.readTime = Math.ceil(wordCount / wordsPerMinute);
  }
  
  // Update likesCount to match likes array length
  if (this.likes && Array.isArray(this.likes)) {
    this.likesCount = this.likes.length;
  }
  
  next();
});

// Method to update analytics
articleSchema.methods.updateAnalytics = async function(pageViewData) {
  const updateData = {};
  
  // Update views
  updateData.$inc = { views: 1 };
  
  // Update total read time
  if (pageViewData.timeOnPage && pageViewData.timeOnPage > 0) {
    updateData.$inc.totalReadTime = pageViewData.timeOnPage;
    
    // Calculate new average read time
    const newTotalReadTime = this.totalReadTime + pageViewData.timeOnPage;
    const newAvgReadTime = newTotalReadTime / (this.views + 1);
    updateData.$set = updateData.$set || {};
    updateData.$set.avgReadTime = Math.round(newAvgReadTime);
  }
  
  // Update bounce count
  if (pageViewData.isBounce) {
    updateData.$inc.bounceCount = 1;
  }
  
  // Update traffic source
  if (pageViewData.source) {
    const sourceField = `trafficSources.${pageViewData.source}`;
    updateData.$inc[sourceField] = (updateData.$inc[sourceField] || 0) + 1;
  }
  
  // Update daily stats
  const today = new Date().toISOString().split('T')[0];
  const dailyStat = this.dailyStats.find(stat => 
    stat.date.toISOString().split('T')[0] === today
  );
  
  if (dailyStat) {
    // Update existing daily stat
    dailyStat.views += 1;
    dailyStat.uniqueVisitors += pageViewData.isNewSession ? 1 : 0;
    if (pageViewData.timeOnPage) {
      const totalTime = dailyStat.avgTimeOnPage * (dailyStat.views - 1) + pageViewData.timeOnPage;
      dailyStat.avgTimeOnPage = Math.round(totalTime / dailyStat.views);
    }
    if (pageViewData.isBounce) {
      dailyStat.bounceRate = Math.round((dailyStat.bounceRate * (dailyStat.views - 1) + 100) / dailyStat.views);
    }
  } else {
    // Create new daily stat
    this.dailyStats.push({
      date: new Date(),
      views: 1,
      uniqueVisitors: pageViewData.isNewSession ? 1 : 0,
      avgTimeOnPage: pageViewData.timeOnPage || 0,
      bounceRate: pageViewData.isBounce ? 100 : 0
    });
  }
  
  // Apply updates
  await this.updateOne(updateData);
  
  // Save daily stats separately
  await this.save();
  
  return this;
};

/**
 * Updates scroll depth tracking for the article
 * @param {number} depth - Scroll depth percentage (25, 50, 75, 100)
 * @returns {Promise<Article>} Updated article document
 */
articleSchema.methods.updateScrollDepth = async function(depth) {
  const scrollDepth = this.scrollDepth.find(sd => sd.depth === depth);

  if (scrollDepth) {
    scrollDepth.count += 1;
  } else {
    this.scrollDepth.push({ depth, count: 1 });
  }

  await this.save();
  return this;
};

/**
 * Updates likes for the article (like/unlike)
 * @param {mongoose.Types.ObjectId|string} userId - ID of the user performing the action
 * @param {string} action - Action to perform ('like' or 'unlike')
 * @returns {Promise<Article>} Updated article document
 */
articleSchema.methods.updateLikes = async function(userId, action) {
  if (action === 'like') {
    if (!this.likes.includes(userId)) {
      this.likes.push(userId);
    }
  } else if (action === 'unlike') {
    const index = this.likes.indexOf(userId);
    if (index > -1) {
      this.likes.splice(index, 1);
    }
  }

  this.likesCount = this.likes.length;
  await this.save();
  return this;
};

/**
 * Static method to retrieve top performing articles by view count
 * @param {number} limit - Maximum number of articles to return (default: 10)
 * @param {Date} startDate - Start date for filtering published articles
 * @param {Date} endDate - End date for filtering published articles
 * @returns {Promise<Array>} Array of top performing articles with populated author data
 */
articleSchema.statics.getTopArticles = async function(limit = 10, startDate, endDate) {
  const matchStage = {
    status: 'published'
  };

  if (startDate && endDate) {
    matchStage.publishedAt = { $gte: startDate, $lte: endDate };
  }

  return this.find(matchStage)
    .sort({ views: -1 })
    .limit(limit)
    .populate('author', 'name username avatar')
    .select('title slug category views likesCount commentCount shares publishedAt author')
    .lean();
};

/**
 * Static method to get aggregated statistics for each category
 * @param {Date} startDate - Start date for filtering published articles
 * @param {Date} endDate - End date for filtering published articles
 * @returns {Promise<Array>} Array of category statistics including views, engagement metrics, and average engagement rate
 */
articleSchema.statics.getCategoryStats = async function(startDate, endDate) {
  const matchStage = {
    status: 'published'
  };

  if (startDate && endDate) {
    matchStage.publishedAt = { $gte: startDate, $lte: endDate };
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$category',
        totalViews: { $sum: '$views' },
        articleCount: { $sum: 1 },
        totalLikes: { $sum: '$likesCount' },
        totalComments: { $sum: '$commentCount' },
        totalShares: { $sum: '$shares' },
        totalBookmarks: { $sum: '$bookmarks' }
      }
    },
    {
      $project: {
        category: '$_id',
        views: '$totalViews',
        articles: '$articleCount',
        likes: '$totalLikes',
        comments: '$totalComments',
        shares: '$totalShares',
        bookmarks: '$totalBookmarks',
        totalEngagement: {
          $add: ['$totalLikes', { $multiply: ['$totalComments', 2] }, '$totalShares', '$totalBookmarks']
        }
      }
    },
    {
      $addFields: {
        avgEngagementRate: {
          $cond: [
            { $eq: ['$views', 0] },
            0,
            { $multiply: [{ $divide: ['$totalEngagement', '$views'] }, 100] }
          ]
        }
      }
    },
    { $sort: { views: -1 } }
  ]);

  return stats;
};

/**
 * Static method to get trending articles based on trending score and views
 * @param {number} limit - Maximum number of articles to return (default: 10)
 * @param {string} category - Optional category filter
 * @returns {Promise<Array>} Array of trending articles from the last 7 days with populated author data
 */
articleSchema.statics.getTrendingArticles = async function(limit = 10, category = null) {
  const matchStage = {
    status: 'published',
    publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
  };

  if (category) {
    matchStage.category = category;
  }

  return this.find(matchStage)
    .sort({ trendingScore: -1, views: -1 })
    .limit(limit)
    .populate('author', 'name username avatar')
    .select('title slug category views likesCount commentCount shares trendingScore publishedAt excerpt featuredImage')
    .lean();
};

module.exports = mongoose.model('Article', articleSchema);