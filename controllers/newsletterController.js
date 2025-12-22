const Newsletter = require('../models/Newsletter');
const Article = require('../models/Article');
const emailService = require('../utils/emailService');

class NewsletterController {
  // Subscribe to newsletter
  async subscribe(req, res) {
    try {
      const { email, preferences = {} } = req.body;

      // Extract name from email (part before @)
      const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      // Check if already subscribed
      let subscriber = await Newsletter.findOne({ email });

      if (subscriber) {
        if (subscriber.isActive) {
          return res.status(400).json({
            success: false,
            error: 'Email is already subscribed'
          });
        } else {
          // Reactivate existing subscription
          subscriber.isActive = true;
          subscriber.preferences = preferences;
          await subscriber.save();
        }
      } else {
        // Create new subscription
        subscriber = new Newsletter({
          email,
          name,
          preferences
        });
        await subscriber.save();
      }

      // Send welcome email
      try {
        await emailService.sendWelcomeNewsletter(email, subscriber.token);
      } catch (emailError) {
        console.error('Welcome email error:', emailError);
        // Don't fail the subscription if email fails
      }

      res.status(201).json({
        success: true,
        message: 'Successfully subscribed to newsletter'
      });
    } catch (error) {
      console.error('Newsletter subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to subscribe to newsletter'
      });
    }
  }

  // Unsubscribe from newsletter
  async unsubscribe(req, res) {
    try {
      const { email, token } = req.body;

      const subscriber = await Newsletter.findOne({ 
        email,
        token 
      });

      if (!subscriber) {
        return res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
      }

      subscriber.isActive = false;
      await subscriber.save();

      res.json({
        success: true,
        message: 'Successfully unsubscribed from newsletter'
      });
    } catch (error) {
      console.error('Newsletter unsubscribe error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to unsubscribe'
      });
    }
  }

  // Get subscribers (Admin)
  async getSubscribers(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const subscribers = await Newsletter.find()
        .sort({ subscribedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await Newsletter.countDocuments();

      res.json({
        success: true,
        data: {
          subscribers,
          pagination: {
            current: page,
            total: Math.ceil(total / limit),
            totalItems: total
          }
        }
      });
    } catch (error) {
      console.error('Get subscribers error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch subscribers'
      });
    }
  }

  // Get subscriber count (Admin)
  async getSubscriberCount(req, res) {
    try {
      const totalSubscribers = await Newsletter.countDocuments({ isActive: true });

      res.json({
        success: true,
        data: {
          totalSubscribers
        }
      });
    } catch (error) {
      console.error('Get subscriber count error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch subscriber count'
      });
    }
  }

  // Send newsletter (Admin)
  async sendNewsletter(req, res) {
    try {
      const { subject, content, articleIds, sendToAll = true, testEmail } = req.body;

      // If test email is provided, send test
      if (testEmail) {
        await emailService.sendEmail(
          testEmail,
          `TEST: ${subject}`,
          content
        );

        return res.json({
          success: true,
          message: 'Test email sent successfully'
        });
      }

      // Get trending articles if no specific articles provided
      let articles = [];
      if (articleIds && articleIds.length > 0) {
        articles = await Article.find({
          _id: { $in: articleIds },
          status: 'published'
        }).populate('author', 'username');
      } else {
        articles = await Article.find({ status: 'published' })
          .sort({ trendingScore: -1 })
          .limit(5)
          .populate('author', 'username');
      }

      // Get subscribers
      const subscribers = sendToAll ? 
        await Newsletter.find({ isActive: true }) :
        []; // Could add filtering logic here

      let sentCount = 0;
      let errorCount = 0;

      // Send emails (in production, this should be queued)
      for (const subscriber of subscribers) {
        try {
          // Customize content for each subscriber if needed
          const personalizedContent = this.personalizeContent(content, subscriber, articles);
          
          await emailService.sendEmail(
            subscriber.email,
            subject,
            personalizedContent
          );
          sentCount++;
        } catch (error) {
          console.error(`Failed to send to ${subscriber.email}:`, error);
          errorCount++;
        }
      }

      res.json({
        success: true,
        data: {
          sent: sentCount,
          failed: errorCount,
          total: subscribers.length
        }
      });
    } catch (error) {
      console.error('Send newsletter error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send newsletter'
      });
    }
  }

  // Send automated trending newsletter
  async sendTrendingNewsletter() {
    try {
      const subscribers = await Newsletter.find({ 
        isActive: true,
        'preferences.frequency': 'weekly'
      });

      const trendingArticles = await Article.find({ status: 'published' })
        .sort({ trendingScore: -1 })
        .limit(5)
        .populate('author', 'username')
        .exec();

      let sentCount = 0;

      for (const subscriber of subscribers) {
        try {
          await emailService.sendTrendingNewsletter(subscriber, trendingArticles);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send trending newsletter to ${subscriber.email}:`, error);
        }
      }

      console.log(`Sent trending newsletter to ${sentCount} subscribers`);
      return sentCount;
    } catch (error) {
      console.error('Send trending newsletter error:', error);
      throw error;
    }
  }

  // Check subscription status for a user
  async checkSubscription(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required'
        });
      }

      const subscriber = await Newsletter.findOne({ email, isActive: true });

      res.json({
        success: true,
        isSubscribed: !!subscriber,
        subscriber: subscriber ? {
          email: subscriber.email,
          preferences: subscriber.preferences,
          subscribedAt: subscriber.subscribedAt
        } : null
      });
    } catch (error) {
      console.error('Check subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check subscription status'
      });
    }
  }

  // Get subscription status for authenticated user
  async getStatus(req, res) {
    try {
      const userId = req.user.id;

      // Find user to get email, then check newsletter subscription
      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const subscriber = await Newsletter.findOne({ email: user.email, isActive: true });

      res.json({
        success: true,
        subscribed: !!subscriber,
        preferences: subscriber ? subscriber.preferences : null,
        subscriber: subscriber ? {
          email: subscriber.email,
          subscribedAt: subscriber.subscribedAt
        } : null
      });
    } catch (error) {
      console.error('Get subscription status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get subscription status'
      });
    }
  }

  // Update newsletter preferences
  async updatePreferences(req, res) {
    try {
      const userId = req.user.id;
      const { preferences } = req.body;

      // Find user to get email
      const User = require('../models/User');
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Update or create subscriber preferences
      const subscriber = await Newsletter.findOneAndUpdate(
        { email: user.email },
        { preferences },
        { new: true, upsert: true }
      );

      res.json({
        success: true,
        message: 'Preferences updated successfully',
        preferences: subscriber.preferences
      });
    } catch (error) {
      console.error('Update preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update preferences'
      });
    }
  }

  // Personalize newsletter content
  personalizeContent(content, subscriber, articles) {
    // Basic personalization - could be enhanced with more dynamic content
    let personalized = content.replace(/{{name}}/g, subscriber.email.split('@')[0]);

    // Add article recommendations based on subscriber preferences
    if (subscriber.preferences.categories && subscriber.preferences.categories.length > 0) {
      const preferredArticles = articles.filter(article =>
        subscriber.preferences.categories.includes(article.category)
      );

      if (preferredArticles.length > 0) {
        const articlesHtml = preferredArticles.map(article => `
          <div style="margin: 10px 0; padding: 10px; border-left: 3px solid #4F46E5;">
            <h3 style="margin: 0;">${article.title}</h3>
            <p style="margin: 5px 0;">${article.excerpt || article.content.substring(0, 100)}...</p>
          </div>
        `).join('');

        personalized += `<h2>Recommended for You</h2>${articlesHtml}`;
      }
    }

    return personalized;
  }
}

module.exports = new NewsletterController();
