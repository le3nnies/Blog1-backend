
const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const { authMiddleware, authorMiddleware, adminMiddleware } = require('../middleware/auth');
const { 
  validateArticle, 
  validateArticleUpdate, // Import the new validation
  handleValidationErrors 
} = require('../middleware/validation');
const { upload, handleUploadError } = require('../middleware/upload');

// Public routes
router.get('/', articleController.getArticles);
router.get('/trending', articleController.getTrendingArticles);
router.get('/category/:category', articleController.getArticlesByCategory);
router.get('/slug/:slug', articleController.getArticleBySlug);
router.get('/:slug/related', articleController.getRelatedArticles);
router.get('/:id', articleController.getArticleById);
router.post('/:id/view', articleController.incrementViewCount);

// Protected routes (require authentication)
router.post('/:id/like', authMiddleware, articleController.likeArticle);
router.post('/:id/comment', authMiddleware, articleController.addComment);

// Debug endpoint to see what slug is received
router.get('/debug/slug/:slug', (req, res) => {
  const { slug } = req.params;
  console.log('🔍 DEBUG - Received slug:', slug);
  console.log('🔍 DEBUG - Slug type:', typeof slug);
  console.log('🔍 DEBUG - Slug length:', slug.length);
  console.log('🔍 DEBUG - Raw slug:', JSON.stringify(slug));
  console.log('🔍 DEBUG - URL:', req.originalUrl);
  
  res.json({
    success: true,
    debug: {
      receivedSlug: slug,
      slugType: typeof slug,
      slugLength: slug.length,
      rawSlug: slug,
      url: req.originalUrl
    }
  });
});

// Admin/Author routes - CREATE uses full validation
router.post(
  '/',
  authMiddleware,
  authorMiddleware,
  validateArticle, // Use full validation for creation
  articleController.createArticle
);

// UPDATE uses partial validation
router.put(
  '/:id',
  authMiddleware,
  authorMiddleware,
  upload.single('featuredImage'),
  handleUploadError,
  validateArticleUpdate, // Use update validation (optional fields)
  articleController.updateArticle
);

router.delete(
  '/:id',
  authMiddleware,
  authorMiddleware,
  articleController.deleteArticle
);

router.get(
  '/admin/drafts',
  authMiddleware,
  authorMiddleware,
  articleController.getDraftArticles
);

router.post(
  '/:id/publish',
  authMiddleware,
  authorMiddleware,
  articleController.publishArticle
);

// Change article author (Admin only)
router.put(
  '/:id/author',
  authMiddleware,
  adminMiddleware,
  articleController.changeArticleAuthor
);

module.exports = router;
