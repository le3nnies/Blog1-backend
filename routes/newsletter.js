const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { validateNewsletter } = require('../middleware/validation');

// Public routes
router.post('/subscribe', validateNewsletter, newsletterController.subscribe);
router.post('/unsubscribe', newsletterController.unsubscribe);
router.post('/check-subscription', newsletterController.checkSubscription);
router.get('/status', authMiddleware, newsletterController.getStatus);
router.put('/preferences', authMiddleware, newsletterController.updatePreferences);

// Admin routes
router.get('/subscribers', authMiddleware, adminMiddleware, newsletterController.getSubscribers);
router.get('/subscriber-count', authMiddleware, adminMiddleware, newsletterController.getSubscriberCount);
router.post('/send', authMiddleware, adminMiddleware, newsletterController.sendNewsletter);

module.exports = router;