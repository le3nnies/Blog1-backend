const express = require('express');  
const router = express.Router();  
const analyticsController = require('../controllers/analyticsController');  
  
// All analytics routes are now public (no authentication required)  
router.get('/dashboard', analyticsController.getDashboardStats);  
router.get('/', analyticsController.getAnalytics);  
router.get('/active-sessions', analyticsController.getActiveSessions);  
router.get('/total-views', analyticsController.getTotalViews);  
router.get('/realtime', analyticsController.getRealTimeAnalytics);  
router.get('/realtime-metrics', analyticsController.getRealtimeMetrics);  
router.get('/comments', analyticsController.getCommentsAnalytics);  
router.get('/articles/:articleId', analyticsController.getArticleAnalytics);  
router.get('/behavior', analyticsController.getReaderBehavior);  
router.get('/report', analyticsController.generateReport);  
router.get('/export', analyticsController.exportData);  
  
module.exports = router;
