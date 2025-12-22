const Article = require('../models/Article');
const mongoose = require('mongoose');

const calculateTrendingScore = (article) => {
  // Check if article is published
  if (article.status !== 'published') {
    return 0;
  }

  // Use publishedAt or fall back to createdAt for recency calculation
  const publishDate = article.publishedAt || article.createdAt;
  if (!publishDate) {
    return 0;
  }

  const hoursSincePublished = (Date.now() - new Date(publishDate).getTime()) / (1000 * 60 * 60);
  const recencyFactor = Math.max(0.1, 1 - (hoursSincePublished / 168)); // 1 week decay

  // Use default values if fields are missing
  const views = article.views || 0;
  const likesCount = article.likesCount || 0;
  const comments = article.comments || [];
  const shares = article.shares || 0;
  const readCompletionRate = article.readCompletionRate || 0;

  const engagementScore = (
    (views * 0.35) +
    (likesCount * 0.25) +
    (comments.length * 0.20) +
    (shares * 0.20)
  );

  // Read completion rate bonus
  const completionBonus = readCompletionRate * 10;
  
  // Comment engagement bonus (if comments have likes)
  const commentEngagement = comments.reduce((sum, comment) => {
    return sum + (comment.likes || 0);
  }, 0) * 0.1;

  const finalScore = (engagementScore * recencyFactor) + completionBonus + commentEngagement;
  
  // Give a small base score for new published articles to help them get initial visibility
  const baseScore = engagementScore === 0 ? 0.1 : 0;
  
  return finalScore + baseScore;
};

const updateAllTrendingScores = async () => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, skipping trending score update');
      return;
    }

    console.log('🔄 Fetching articles for trending score update...');
    
    // Find all published articles regardless of publishedAt
    const articles = await Article.find({ 
      status: 'published'
    });
    
    console.log(`📊 Found ${articles.length} published articles`);
    
    if (articles.length === 0) {
      console.log('ℹ️  No published articles found.');
      return;
    }

    let updatedCount = 0;
    const updatePromises = articles.map(async (article) => {
      const trendingScore = calculateTrendingScore(article);
      
      // Update all articles with their calculated score (even if 0)
      updatedCount++;
      return Article.findByIdAndUpdate(
        article._id, 
        { 
          trendingScore,
          // Also ensure publishedAt is set if it's missing
          ...(!article.publishedAt && { publishedAt: article.createdAt })
        }
      );
    });
    
    await Promise.all(updatePromises);
    console.log(`✅ Updated trending scores for ${updatedCount} articles`);
    
    // Log detailed info about each article
    console.log('\n📈 Trending Score Details:');
    articles.forEach((article, index) => {
      const score = calculateTrendingScore(article);
      const publishDate = article.publishedAt || article.createdAt;
      const hoursOld = (Date.now() - new Date(publishDate).getTime()) / (1000 * 60 * 60);
      
      console.log(`\nArticle ${index + 1}: "${article.title}"`);
      console.log(`  📊 Score: ${score.toFixed(4)}`);
      console.log(`  ⏰ Published: ${hoursOld.toFixed(1)} hours ago`);
      console.log(`  👀 Views: ${article.views || 0}`);
      console.log(`  ❤️  Likes: ${article.likesCount || 0}`);
      console.log(`  💬 Comments: ${article.comments?.length || 0}`);
      console.log(`  🔄 Shares: ${article.shares || 0}`);
    });
    
  } catch (error) {
    console.error('❌ Error updating trending scores:', error);
  }
};

const getTrendingArticles = async (limit = 10, category = null) => {
  try {
    const query = { 
      status: 'published'
    };
    
    if (category) {
      query.category = category;
    }
    
    const articles = await Article.find(query)
      .sort({ 
        trendingScore: -1,
        // Fallback to recent articles if scores are similar
        createdAt: -1 
      })
      .limit(limit)
      .populate('author', 'username avatar')
      .exec();
      
    return articles;
  } catch (error) {
    console.error('Error fetching trending articles:', error);
    throw error;
  }
};

// Auto-update trending scores every hour
const startTrendingScoreUpdates = () => {
  console.log('🔄 Starting trending score updates...');
  
  // Update immediately on start (with a small delay to ensure DB is ready)
  setTimeout(updateAllTrendingScores, 3000);
  
  // Then update every hour
  setInterval(updateAllTrendingScores, 60 * 60 * 1000);
};

module.exports = {
  calculateTrendingScore,
  updateAllTrendingScores,
  getTrendingArticles,
  startTrendingScoreUpdates
};