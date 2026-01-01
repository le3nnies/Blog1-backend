const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Dashboard stats accessible to everyone (no authentication required for basic stats)
router.get('/dashboard', analyticsController.getDashboardStats);

// All analytics routes require authentication
router.use(authMiddleware);

// Main analytics endpoint (requires authentication)
router.get('/', analyticsController.getAnalytics);

// Temporarily remove admin auth for testing active-sessions
router.get('/active-sessions', analyticsController.getActiveSessions);

// Admin-only analytics routes
router.use(adminMiddleware);

router.get('/total-views', analyticsController.getTotalViews);
router.get('/realtime', analyticsController.getRealTimeAnalytics);
router.get('/realtime-metrics', analyticsController.getRealtimeMetrics);
router.get('/comments', analyticsController.getCommentsAnalytics);
router.get('/articles/:articleId', analyticsController.getArticleAnalytics);
router.get('/behavior', analyticsController.getReaderBehavior); // Fixed function name

// Report and export routes
router.get('/report', analyticsController.generateReport);
router.get('/export', analyticsController.exportData);

module.exports = router;