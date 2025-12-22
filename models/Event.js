// models/Event.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    index: true
  },
  eventType: {
    type: String,
    enum: ['like', 'comment', 'share', 'bookmark', 'scroll', 'click', 'view', 'search', 'login', 'logout'],
    required: true
  },
  eventData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    referrer: String,
    pageUrl: String,
    screenResolution: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
eventSchema.index({ articleId: 1, eventType: 1, createdAt: -1 });
eventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
eventSchema.index({ eventType: 1, createdAt: -1 });
eventSchema.index({ createdAt: 1 });

// Static method to get event counts
eventSchema.statics.getEventCounts = async function(startDate, endDate, articleId = null) {
  const matchStage = {
    createdAt: { $gte: startDate, $lte: endDate }
  };

  if (articleId) {
    matchStage.articleId = articleId;
  }

  const counts = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Convert to object format
  const result = {};
  counts.forEach(item => {
    result[item._id] = item.count;
  });

  return result;
};

// Static method to get engagement trends
eventSchema.statics.getEngagementTrends = async function(startDate, endDate, eventTypes = ['like', 'comment', 'share']) {
  const trends = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        eventType: { $in: eventTypes }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          eventType: '$eventType'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        data: {
          $push: {
            eventType: '$_id.eventType',
            count: '$count'
          }
        }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // Format the data
  return trends.map(trend => {
    const formatted = { date: trend._id };
    trend.data.forEach(item => {
      formatted[item.eventType] = item.count;
    });
    return formatted;
  });
};

// Method to get basic info
eventSchema.methods.getBasicInfo = function() {
  return {
    id: this._id,
    eventType: this.eventType,
    articleId: this.articleId,
    userId: this.userId,
    eventData: this.eventData,
    createdAt: this.createdAt
  };
};

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;