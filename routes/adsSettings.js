const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Stripe = require('stripe');

// Use your actual auth middleware instead of simpleAuth
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Import stripe service
const stripeService = require('../services/stripe-service');

// Import AdsSettings model
const AdsSettings = require('../models/AdsSettings');

// @route   GET /api/ads/settings
// @desc    Get ads settings
// @access  Private (Admin only)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📋 Fetching ads settings for user:', req.user.email);
    const settings = await AdsSettings.getSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching ads settings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching settings'
    });
  }
});

// @route   PUT /api/ads/settings
// @desc    Update ads settings
// @access  Private (Admin only)
router.put('/', [
  authMiddleware,
  adminMiddleware,
  body('siteName').optional().isLength({ min: 1 }),
  body('adCurrency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
  body('defaultCommissionRate').optional().isFloat({ min: 0, max: 100 }),
  body('taxRate').optional().isFloat({ min: 0, max: 50 }),
  body('maxAdsPerPage').optional().isInt({ min: 1, max: 10 }),
  body('adRefreshInterval').optional().isInt({ min: 0, max: 3600 }),
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    console.log('📝 Updating ads settings by user:', req.user.email);

    // Update settings using the model
    const updatedSettings = await AdsSettings.updateSettings(req.body);

    res.json({
      success: true,
      data: updatedSettings,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating ads settings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error updating settings'
    });
  }
});


// @route   POST /api/ads/stripe/test-connection
// @desc    Test Stripe connection with provided credentials
// @access  Private (Admin only)
router.post('/stripe/test-connection', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { stripeSecretKey } = req.body;
    const settings = await AdsSettings.getSettings();
    const secretKey = stripeSecretKey || settings.stripeSecretKey;

    if (!secretKey) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Stripe secret key is required'
      });
    }

    console.log('🔌 Testing Stripe connection for user:', req.user.email);
    const result = await stripeService.testConnection(secretKey);

    res.json({
      success: result.success,
      valid: result.valid,
      message: result.valid ? 'Stripe connection successful' : result.error,
      account: result.account
    });

  } catch (error) {
    console.error('Stripe connection test failed:', error);
    res.status(400).json({
      success: false,
      valid: false,
      message: error.message
    });
  }
});

// @route   POST /api/ads/stripe/generate-webhook
// @desc    Generate Stripe webhook secret
// @access  Private (Admin only)
router.post('/stripe/generate-webhook', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { webhookUrl, stripeSecretKey } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'Webhook URL is required'
      });
    }

    const settings = await AdsSettings.getSettings();
    const secretKey = stripeSecretKey || settings.stripeSecretKey;

    if (!secretKey) {
      return res.status(400).json({
        success: false,
        error: 'Stripe secret key is required'
      });
    }

    console.log('🔗 Generating Stripe webhook for:', webhookUrl);
    const result = await stripeService.generateWebhook(webhookUrl, secretKey);

    if (result.success) {
      // Update webhook secret in settings
      settings.stripeWebhookSecret = result.webhookSecret;
      await settings.save();
    }

    res.json({
      success: result.success,
      webhookSecret: result.webhookSecret,
      webhookId: result.webhookId,
      url: result.url,
      message: result.success ? 'Webhook endpoint created successfully' : result.error
    });

  } catch (error) {
    console.error('Failed to create webhook:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/ads/stripe/create-payment-intent
// @desc    Create a Stripe payment intent for ad campaigns
// @access  Private (Admin/Advertiser)
router.post('/stripe/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'usd', campaignId } = req.body;

    const result = await stripeService.createPaymentIntent(
      amount, 
      currency, 
      req.user.id, 
      req.user.email, 
      campaignId
    );

    res.json(result);
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/ads/stripe/webhook
// @desc    Handle Stripe webhook events
// @access  Public (Stripe calls this directly)
router.post('/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  try {
    const result = await stripeService.processWebhookEvent(req.body, signature);
    res.json({ received: true, processed: result.event });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// @route   GET /api/ads/stripe/transactions
// @desc    Get user's transaction history
// @access  Private
router.get('/stripe/transactions', authMiddleware, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const transactions = await stripeService.getUserTransactions(req.user.id, parseInt(limit));
    
    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching transaction history'
    });
  }
});

module.exports = router;