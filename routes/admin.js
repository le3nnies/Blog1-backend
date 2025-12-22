const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const articleController = require('../controllers/articleController');
const adController = require('../controllers/adController');
const analyticsController = require('../controllers/analyticsController');
const newsletterController = require('../controllers/newsletterController');
const adminController = require('../controllers/adminController'); // Add this line
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Apply admin middleware to all routes
router.use(authMiddleware, adminMiddleware);

// User Management Routes
router.get('/users', userController.getAllUsers);
router.get('/users/:id', userController.getUserById);
router.put('/users/:id', userController.updateUser);
router.put('/users/:id/role', userController.updateUserRole);
router.put('/users/:id/status', userController.updateUserStatus);
router.delete('/users/:id', userController.deleteUser);
router.get('/users/:id/articles', userController.getUserArticles);

// Article Management Routes
router.get('/articles', articleController.getAllArticles);
router.get('/articles/stats', articleController.getArticleStats);
router.put('/articles/:id/status', articleController.updateArticleStatus);
router.post('/articles/bulk', articleController.bulkArticleOperations);

// Ad Management Routes
router.get('/ads/performance', adController.getAdPerformance);
router.get('/ads/revenue', adController.getRevenueAnalytics);

// Analytics Routes - FIXED: Each route needs a unique function
router.get('/dashboard/stats', analyticsController.getDashboardStats);
router.get('/revenue/breakdown', analyticsController.getRevenueBreakdown);
router.get('/user/engagement', analyticsController.getUserEngagement);
router.get('/analytics/overview', analyticsController.getAnalyticsOverview); // Line 37 - Changed to unique function
router.get('/analytics/realtime', analyticsController.getRealtimeMetrics);

// Newsletter Management Routes
//router.get('/newsletter/stats', newsletterController.getNewsletterStats);
//router.post('/newsletter/bulk', newsletterController.bulkNewsletterOperations);

// System Management Routes - FIXED: Use adminController instead of userController
router.get('/system/health', adminController.getSystemHealth);
router.post('/system/backup', adminController.createBackup);
router.get('/system/logs', adminController.getSystemLogs);

// Add a catch-all route for testing
router.get('/test', (req, res) => {
    res.json({ message: 'Admin route working!' });
});

module.exports = router;