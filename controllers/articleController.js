const Article = require('../models/Article');
const Newsletter = require('../models/Newsletter');
const { getTrendingArticles, calculateTrendingScore } = require('../utils/trendingAlgorithm');
const slugify = require('slugify');
const mongoose = require('mongoose');

class ArticleController {
  // Get all published articles with pagination and filtering
  async getArticles(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const category = req.query.category;
      const tag = req.query.tag;
      const search = req.query.search;
      const sortBy = req.query.sortBy || 'publishedAt';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      const skip = (page - 1) * limit;

      // Build query
      const query = { status: 'published' };
      
      if (category) query.category = category;
      if (tag) query.tags = { $in: [tag] };
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } }
        ];
      }

      // Get articles
      const articles = await Article.find(query)
        .populate('author', 'username avatar bio')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec();

      // Get total count for pagination
      const total = await Article.countDocuments(query);
      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: {
          articles,
          pagination: {
            current: page,
            total: totalPages,
            totalItems: total,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });
    } catch (error) {
      console.error('Get articles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch articles'
      });
    }
  }

  // Add to articleController.js

// Get all articles with advanced filtering (Admin only)
async getAllArticles(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const category = req.query.category;
    const author = req.query.author;
    const search = req.query.search;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (category) query.category = category;
    if (author) query.author = author;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    const articles = await Article.find(query)
      .populate('author', 'username avatar')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .exec();

    const total = await Article.countDocuments(query);

    res.json({
      success: true,
      data: {
        articles,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          totalItems: total
        }
      }
    });
  } catch (error) {
    console.error('Get all articles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch articles'
    });
  }
}

// Get article statistics (Admin only)
async getArticleStats(req, res) {
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

    const stats = await Article.aggregate([
      { $match: { createdAt: dateFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: '$likesCount' },
          totalComments: { $sum: { $size: '$comments' } },
          avgTrendingScore: { $avg: '$trendingScore' }
        }
      }
    ]);

    // Get top performing articles
    const topArticles = await Article.find({
      status: 'published',
      createdAt: dateFilter
    })
      .populate('author', 'username')
      .sort({ views: -1 })
      .limit(5)
      .select('title views likesCount trendingScore');

    res.json({
      success: true,
      data: {
        statistics: stats,
        topArticles
      }
    });
  } catch (error) {
    console.error('Get article stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch article statistics'
    });
  }
}

// Update article status (Admin only)
async updateArticleStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['draft', 'published', 'scheduled', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const updateData = { status };
    
    // Set publishedAt if publishing for the first time
    if (status === 'published') {
      const article = await Article.findById(id);
      if (article && !article.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }

    const article = await Article.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('author', 'username avatar');

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    res.json({
      success: true,
      data: article,
      message: `Article status updated to ${status}`
    });
  } catch (error) {
    console.error('Update article status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update article status'
    });
  }
}

// Bulk article operations (Admin only)
async bulkArticleOperations(req, res) {
  try {
    const { operation, articleIds, data } = req.body;

    if (!['publish', 'archive', 'delete', 'update'].includes(operation)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation'
      });
    }

    let result;
    switch (operation) {
      case 'publish':
        result = await Article.updateMany(
          { _id: { $in: articleIds } },
          { 
            status: 'published',
            publishedAt: new Date()
          }
        );
        break;
      
      case 'archive':
        result = await Article.updateMany(
          { _id: { $in: articleIds } },
          { status: 'archived' }
        );
        break;
      
      case 'delete':
        result = await Article.deleteMany({ _id: { $in: articleIds } });
        break;
      
      case 'update':
        result = await Article.updateMany(
          { _id: { $in: articleIds } },
          data
        );
        break;
    }

    res.json({
      success: true,
      data: result,
      message: `Bulk operation '${operation}' completed successfully`
    });
  } catch (error) {
    console.error('Bulk article operations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform bulk operations'
    });
  }
}



  // Get single article by slug
  async getArticleBySlug(req, res) {
  try {
    const { slug } = req.params;
    
    console.log('🔍 Backend: getArticleBySlug called with slug:', slug);
    console.log('🔍 Backend: Slug length:', slug.length);

    // First, let's check what articles exist with a direct database query
    console.log('🔍 Backend: Checking all published articles...');
    const allArticles = await Article.find({ status: 'published' }, 'slug title _id');
    console.log(`🔍 Backend: Found ${allArticles.length} published articles:`);
    
    allArticles.forEach(article => {
      const isExactMatch = article.slug === slug;
      console.log(`   - "${article.slug}" (title: "${article.title}")`);
      console.log(`     Exact match: ${isExactMatch}`);
      console.log(`     Length: ${article.slug.length}`);
      if (isExactMatch) {
        console.log('     ✅ THIS SHOULD MATCH!');
      }
    });

    // Now try the exact query
    console.log('🔍 Backend: Executing exact query...');
    const query = { 
      slug: slug,
      status: 'published' 
    };
    console.log('🔍 Backend: MongoDB query:', JSON.stringify(query));

    let article = await Article.findOne(query)
      .populate('author', 'username avatar')
      .populate({
        path: 'comments.user',
        select: 'username avatar',
        options: { strictPopulate: false }
      });

    if (article) {
      console.log('✅ Backend: Article found with exact match!');
      console.log('✅ Backend: Article title:', article.title);
      return res.json({
        success: true,
        data: article
      });
    }

    console.log('❌ Backend: No article found with exact match');

    // Let's try a more aggressive search to see what's happening
    console.log('🔍 Backend: Trying aggressive search...');
    
    // Try with trimmed slug
    const trimmedSlug = slug.trim();
    if (trimmedSlug !== slug) {
      console.log('🔍 Backend: Trying trimmed slug:', trimmedSlug);
      article = await Article.findOne({ 
        slug: trimmedSlug,
        status: 'published' 
      });
      if (article) {
        console.log('✅ Backend: Article found with trimmed slug!');
        return res.json({
          success: true,
          data: article
        });
      }
    }

    // Try case-insensitive
    console.log('🔍 Backend: Trying case-insensitive search...');
    article = await Article.findOne({ 
      slug: { $regex: new RegExp(`^${slug}$`, 'i') },
      status: 'published' 
    });

    if (article) {
      console.log('✅ Backend: Article found with case-insensitive match!');
      return res.json({
        success: true,
        data: article
      });
    }

    // Final attempt - check if there are any hidden characters
    console.log('🔍 Backend: Checking for hidden characters...');
    console.log('🔍 Backend: Slug char codes:');
    for (let i = 0; i < slug.length; i++) {
      console.log(`   [${i}]: '${slug[i]}' (${slug.charCodeAt(i)})`);
    }

    // Check one of the actual articles for comparison
    if (allArticles.length > 0) {
      const sampleArticle = allArticles[0];
      console.log('🔍 Backend: Sample article slug char codes:');
      for (let i = 0; i < sampleArticle.slug.length; i++) {
        console.log(`   [${i}]: '${sampleArticle.slug[i]}' (${sampleArticle.slug.charCodeAt(i)})`);
      }
    }

    console.log('❌ Backend: Article not found after all search attempts');
    
    return res.status(404).json({
      success: false,
      error: 'Article not found',
      debug: {
        requestedSlug: slug,
        requestedSlugLength: slug.length,
        availableSlugs: allArticles.map(a => ({
          slug: a.slug,
          length: a.slug.length,
          title: a.title
        }))
      }
    });

  } catch (error) {
    console.error('❌ Backend Error in getArticleBySlug:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch article'
    });
  }
}

async getArticleById(req, res) {
  // 1. Extract the article ID from the request parameters
  const { id } = req.params;

  // 2. Validate the ID format (Mongoose ObjectId)
  if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid article ID format.' });
  }

  try {
      // 3. Find the article in the database, populating the author (if applicable)
      // We use lean() for faster read performance since we don't need Mongoose documents methods
      const article = await Article.findById(id)
          .populate('author', 'username firstName lastName avatar') // Assuming you want author details
          .select('-__v') // Exclude the Mongoose version key
          .lean();

      // 4. Handle case where the article is not found
      if (!article) {
          console.log(`Article not found for ID: ${id}`);
          return res.status(404).json({ message: 'Article not found.' });
      }

      // 5. Send the found article back to the client
      res.status(200).json(article);

  } catch (error) {
      // 6. Handle server/database errors
      console.error('Error fetching article by ID:', error);
      res.status(500).json({ message: 'Server error while retrieving article.', error: error.message });
  }
}

  // Get articles by category
  async getArticlesByCategory(req, res) {
    try {
      const { category } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const articles = await Article.find({
        category,
        status: 'published'
      })
        .populate('author', 'username avatar')
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await Article.countDocuments({ 
        category, 
        status: 'published' 
      });

      res.json({
        success: true,
        data: {
          articles,
          pagination: {
            current: page,
            total: Math.ceil(total / limit),
            totalItems: total
          }
        }
      });
    } catch (error) {
      console.error('Get articles by category error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch articles'
      });
    }
  }




  // Increment view count
  async incrementViewCount(req, res) {
    try {
      const { id } = req.params;
      const PageView = require('../models/PageView');

      // Get article details for analytics
      const article = await Article.findById(id);
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      // Update article view count and trending score
      const updatedArticle = await Article.findByIdAndUpdate(
        id,
        {
          $inc: { views: 1 },
          $set: { trendingScore: calculateTrendingScore(article) }
        },
        { new: true }
      );

      // Create page view record for analytics
      try {
        const pageViewData = {
          sessionId: req.headers['x-session-id'] || req.sessionID || 'unknown',
          userId: req.user?._id,
          articleId: id,
          pageUrl: req.headers.referer || req.originalUrl,
          pageTitle: article.title,
          referrer: req.headers.referer,
          source: req.headers['x-traffic-source'] || 'direct',
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          deviceType: req.headers['x-device-type'] || 'unknown',
          browser: req.headers['x-browser'],
          os: req.headers['x-os'],
          country: req.headers['x-country'],
          city: req.headers['x-city'],
          region: req.headers['x-region'],
          language: req.headers['accept-language']?.split(',')[0],
          timezone: req.headers['x-timezone']
        };

        await PageView.create(pageViewData);
      } catch (analyticsError) {
        console.error('Analytics tracking error:', analyticsError);
        // Don't fail the request if analytics tracking fails
      }

      res.json({
        success: true,
        data: { views: updatedArticle.views }
      });
    } catch (error) {
      console.error('Increment view count error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update view count'
      });
    }
  }

  // Like an article
  async likeArticle(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const article = await Article.findById(id);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      const hasLiked = article.likes.includes(userId);

      if (hasLiked) {
        // Unlike
        article.likes.pull(userId);
        article.likesCount = Math.max(0, article.likesCount - 1);
      } else {
        // Like
        article.likes.push(userId);
        article.likesCount += 1;
      }

      // Update trending score
      article.trendingScore = calculateTrendingScore(article);
      await article.save();

      res.json({
        success: true,
        data: {
          likes: article.likesCount,
          hasLiked: !hasLiked
        }
      });
    } catch (error) {
      console.error('Like article error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update like'
      });
    }
  }

  // Add comment
  async addComment(req, res) {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user._id;

      // Check if user is subscribed to newsletter
      const subscriber = await Newsletter.findOne({
        email: req.user.email,
        isActive: true
      });

      if (!subscriber) {
        return res.status(403).json({
          success: false,
          error: 'You must be subscribed to our newsletter to comment on articles'
        });
      }

      const article = await Article.findById(id);

      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      const newComment = {
        user: userId,
        content,
        likes: 0
      };

      article.comments.push(newComment);
      article.trendingScore = calculateTrendingScore(article);
      await article.save();

      // Populate the new comment with user data
      await article.populate({
        path: 'comments.user',
        select: 'username avatar',
        options: { strictPopulate: false }
      });

      const addedComment = article.comments[article.comments.length - 1];

      res.status(201).json({
        success: true,
        data: addedComment
      });
    } catch (error) {
      console.error('Add comment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add comment'
      });
    }
  }

  // Create new article (Admin/Author)
  async createArticle(req, res) {
    try {
      const {
        title,
        content,
        excerpt,
        category,
        tags,
        metaTitle,
        metaDescription,
        status,
        scheduledFor,
        featuredImage
      } = req.body;

      // Generate slug from title
      const slug = slugify(title, { 
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g
      });

      // Check if slug already exists
      const existingArticle = await Article.findOne({ slug });
      if (existingArticle) {
        return res.status(400).json({
          success: false,
          error: 'An article with similar title already exists'
        });
      }

      const articleData = {
        title,
        content,
        excerpt: excerpt || content.substring(0, 150) + '...',
        slug,
        category,
        tags: tags || [],
        author: req.user._id,
        metaTitle: metaTitle || title,
        metaDescription: metaDescription || excerpt || content.substring(0, 150),
        status: status || 'published'
      };

      // Handle scheduled publishing
      if (status === 'scheduled' && scheduledFor) {
        articleData.scheduledFor = new Date(scheduledFor);
      } else if (status === 'published') {
        articleData.publishedAt = new Date();
      }

      // Handle featured image URL (no file upload for create)
      if (featuredImage && featuredImage !== "/placeholder.svg" && featuredImage.trim() !== "") {
        // Use the provided featured image URL directly
        articleData.featuredImage = featuredImage;
      }

      const article = new Article(articleData);
      await article.save();

      // Populate author data
      await article.populate('author', 'username avatar');

      res.status(201).json({
        success: true,
        data: article
      });
    } catch (error) {
      console.error('Create article error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create article'
      });
    }
  }

  // Update article (Admin/Author)
  async updateArticle(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };

      const article = await Article.findById(id);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      // Check if user is author or admin
      if (article.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to update this article'
        });
      }

      // Handle slug update
      if (updateData.title && updateData.title !== article.title) {
        updateData.slug = slugify(updateData.title, { 
          lower: true,
          strict: true,
          remove: /[*+~.()'"!:@]/g
        });

        // Check if new slug exists
        const existingArticle = await Article.findOne({ 
          slug: updateData.slug,
          _id: { $ne: id }
        });
        if (existingArticle) {
          return res.status(400).json({
            success: false,
            error: 'An article with similar title already exists'
          });
        }
      }

      // Handle featured image upload or URL
      if (req.file) {
        const { uploadToCloudinary } = require('../utils/cloudinary');
        const result = await uploadToCloudinary(req.file.buffer);
        updateData.featuredImage = result.secure_url;
      } else if (updateData.featuredImage && updateData.featuredImage !== "/placeholder.svg" && updateData.featuredImage.trim() !== "") {
        // Keep the provided featured image URL
      } else {
        // Remove featuredImage if it's the placeholder or empty
        delete updateData.featuredImage;
      }

      // Handle status changes
      if (updateData.status === 'published' && article.status !== 'published') {
        updateData.publishedAt = new Date();
      }

      const updatedArticle = await Article.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate('author', 'username avatar');

      res.json({
        success: true,
        data: updatedArticle
      });
    } catch (error) {
      console.error('Update article error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update article'
      });
    }
  }

  // Delete article (Admin/Author)
  async deleteArticle(req, res) {
    try {
      const { id } = req.params;

      const article = await Article.findById(id);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      // Check if user is author or admin
      if (article.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to delete this article'
        });
      }

      // Delete featured image from Cloudinary if exists
      if (article.featuredImage) {
        const { deleteFromCloudinary, extractPublicId } = require('../utils/cloudinary');
        const publicId = extractPublicId(article.featuredImage);
        if (publicId) {
          await deleteFromCloudinary(publicId);
        }
      }

      await Article.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Article deleted successfully'
      });
    } catch (error) {
      console.error('Delete article error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete article'
      });
    }
  }

  // Get draft articles (Admin/Author)
  async getDraftArticles(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      let query = { status: 'draft' };
      
      // Authors can only see their own drafts
      if (req.user.role !== 'admin') {
        query.author = req.user._id;
      }

      const articles = await Article.find(query)
        .populate('author', 'username avatar')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await Article.countDocuments(query);

      res.json({
        success: true,
        data: {
          articles,
          pagination: {
            current: page,
            total: Math.ceil(total / limit),
            totalItems: total
          }
        }
      });
    } catch (error) {
      console.error('Get draft articles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch draft articles'
      });
    }
  }

  // Publish article (Admin/Author)
  async publishArticle(req, res) {
    try {
      const { id } = req.params;

      const article = await Article.findById(id);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      // Check if user is author or admin
      if (article.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to publish this article'
        });
      }

      const updatedArticle = await Article.findByIdAndUpdate(
        id,
        {
          status: 'published',
          publishedAt: new Date()
        },
        { new: true }
      ).populate('author', 'username avatar');

      res.json({
        success: true,
        data: updatedArticle
      });
    } catch (error) {
      console.error('Publish article error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to publish article'
      });
    }
  }

  // Get related articles
  async getRelatedArticles(req, res) {
    try {
      const { slug } = req.params;
      const limit = parseInt(req.query.limit) || 3;

      // Find the current article to get its category and tags
      const currentArticle = await Article.findOne({ slug, status: 'published' });

      if (!currentArticle) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      // Build query for related articles
      const query = {
        status: 'published',
        _id: { $ne: currentArticle._id }, // Exclude current article
        $or: [
          { category: currentArticle.category }, // Same category
          { tags: { $in: currentArticle.tags } } // Shared tags
        ]
      };

      // Get related articles, prioritizing those with same category and tags
      const relatedArticles = await Article.find(query)
        .populate('author', 'username avatar')
        .sort({
          category: -1, // Prioritize same category
          trendingScore: -1, // Then by trending score
          publishedAt: -1 // Finally by recency
        })
        .limit(limit)
        .exec();

      res.json({
        success: true,
        data: relatedArticles
      });
    } catch (error) {
      console.error('Get related articles error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch related articles'
      });
    }
  }

  //Trending articles
  async getTrendingArticles(req, res) {
    try {
      const { limit = 10, category } = req.query;

      const articles = await getTrendingArticles(parseInt(limit), category);

      res.json({
        success: true,
        data: articles,
        count: articles.length
      });
    } catch (error) {
      console.error('Error fetching trending articles:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch trending articles'
      });
    }
  }

  // Change article author (Admin only)
  async changeArticleAuthor(req, res) {
    try {
      const { id } = req.params;
      const { newAuthorId } = req.body;

      // Validate new author exists and is active
      const newAuthor = await require('../models/User').findOne({
        _id: newAuthorId,
        isActive: true,
        role: { $in: ['admin', 'author', 'editor'] }
      });

      if (!newAuthor) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or inactive author'
        });
      }

      const article = await Article.findById(id);

      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }

      // Update article author
      const updatedArticle = await Article.findByIdAndUpdate(
        id,
        { author: newAuthorId },
        { new: true }
      ).populate('author', 'username avatar');

      res.json({
        success: true,
        data: updatedArticle,
        message: `Article author changed to ${newAuthor.username}`
      });
    } catch (error) {
      console.error('Change article author error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change article author'
      });
    }
  }

}

module.exports = new ArticleController();