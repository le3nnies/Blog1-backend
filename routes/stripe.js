// routes/stripe.js
const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Import with comprehensive error handling
let stripeService;
let serviceLoadError = null;

try {
  console.log('🔄 Attempting to load stripe-service...');
  stripeService = require('../services/stripe-service');
  console.log('✅ stripe-service loaded successfully!');
  console.log('📋 Available methods:', Object.keys(stripeService).filter(key => typeof stripeService[key] === 'function'));
} catch (error) {
  serviceLoadError = error;
  console.error('❌ FAILED to load stripe-service:', error.message);
  console.error('📋 Error details:', error.stack);
  
  // Create emergency fallback
  const Stripe = require('stripe');
  stripeService = {
    testConnection: async (secretKey) => {
      try {
        const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
        const balance = await stripe.balance.retrieve();
        return {
          success: true,
          valid: true,
          account: {
            livemode: balance.livemode,
            currency: balance.available[0]?.currency || 'usd'
          }
        };
      } catch (error) {
        return {
          success: false,
          valid: false,
          error: error.message
        };
      }
    },
    
    generateWebhook: async (webhookUrl, secretKey) => {
      try {
        const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
        const webhookEndpoint = await stripe.webhookEndpoints.create({
          url: webhookUrl,
          enabled_events: [
            'payment_intent.succeeded',
            'payment_intent.payment_failed',
            'charge.succeeded',
            'charge.failed',
          ],
        });
        return {
          success: true,
          webhookSecret: webhookEndpoint.secret,
          webhookId: webhookEndpoint.id,
          url: webhookEndpoint.url
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    },
    
    createPaymentIntent: async (amount, currency, userId, userEmail, campaignId = null) => {
      try {
        // This will fail without proper secret key, but we'll handle it
        throw new Error('Stripe service not properly loaded');
      } catch (error) {
        throw error;
      }
    }
  };
}

// Helper to check if service method is available
const canUseServiceMethod = (methodName) => {
  if (serviceLoadError) {
    console.log(`⚠️ Using fallback for ${methodName} due to service load error`);
    return false;
  }
  const isAvailable = stripeService && typeof stripeService[methodName] === 'function';
  if (!isAvailable) {
    console.log(`⚠️ Method ${methodName} not available, using fallback`);
  }
  return isAvailable;
};

// @route   POST /api/ads/stripe/test-connection
router.post('/test-connection', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { stripePublicKey, stripeSecretKey } = req.body;

    if (!stripeSecretKey) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Stripe secret key is required'
      });
    }

    console.log('🔌 Testing Stripe connection for user:', req.user?.email);
    console.log('🛠️ Using service method:', canUseServiceMethod('testConnection') ? 'stripe-service' : 'fallback');

    const result = await stripeService.testConnection(stripeSecretKey);
    
    if (result.success) {
      res.json({
        success: true,
        valid: true,
        message: 'Stripe connection successful',
        account: result.account
      });
    } else {
      res.status(400).json({
        success: false,
        valid: false,
        message: result.error || 'Failed to connect to Stripe'
      });
    }

  } catch (error) {
    console.error('Stripe connection test failed:', error);
    res.status(400).json({
      success: false,
      valid: false,
      message: error.message || 'Failed to connect to Stripe'
    });
  }
});

// @route   POST /api/ads/stripe/generate-webhook
router.post('/generate-webhook', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { webhookUrl, stripeSecretKey } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'Webhook URL is required'
      });
    }

    if (!stripeSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Stripe secret key is required'
      });
    }

    console.log('🔗 Generating Stripe webhook for:', webhookUrl);
    console.log('🛠️ Using service method:', canUseServiceMethod('generateWebhook') ? 'stripe-service' : 'fallback');

    const result = await stripeService.generateWebhook(webhookUrl, stripeSecretKey);
    
    if (result.success) {
      res.json({
        success: true,
        webhookSecret: result.webhookSecret,
        webhookId: result.webhookId,
        url: result.url,
        message: 'Webhook endpoint created successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create webhook'
      });
    }

  } catch (error) {
    console.error('Failed to create webhook:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create webhook endpoint'
    });
  }
});

// @route   POST /api/ads/stripe/create-payment-intent
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'usd', campaignId } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        error: 'Valid amount is required (minimum $1.00)'
      });
    }

    console.log('🛠️ Using service method for payment intent:', canUseServiceMethod('createPaymentIntent') ? 'stripe-service' : 'fallback');

    if (!canUseServiceMethod('createPaymentIntent')) {
      return res.status(500).json({
        success: false,
        error: 'Payment service temporarily unavailable. Please check server logs.'
      });
    }

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
      error: error.message || 'Failed to create payment intent'
    });
  }
});

// @route   GET /api/ads/stripe/transactions
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    if (!canUseServiceMethod('getUserTransactions')) {
      return res.status(200).json({
        success: true,
        data: [],
        count: 0,
        message: 'Transaction service not available'
      });
    }

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

// @route   POST /api/ads/stripe/webhook
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  try {
    if (!canUseServiceMethod('processWebhookEvent')) {
      console.log('Webhook received but service not available');
      return res.json({ received: true, processed: 'none' });
    }

    const result = await stripeService.processWebhookEvent(req.body, signature);
    res.json({ received: true, processed: result.event });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Add this temporary debug route
router.post('/debug-webhook', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { webhookUrl, stripeSecretKey } = req.body;
    
    if (!webhookUrl || !stripeSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Webhook URL and Stripe secret key are required'
      });
    }

    console.log('🧪 DEBUG: Testing webhook creation directly...');
    
    // Test direct Stripe call without service
    const Stripe = require('stripe');
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    
    console.log('🧪 DEBUG: Stripe instance created, creating webhook...');
    const webhookEndpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: ['payment_intent.succeeded'],
    });
    
    console.log('🧪 DEBUG: Webhook created successfully!');
    
    res.json({
      success: true,
      webhookSecret: webhookEndpoint.secret,
      webhookId: webhookEndpoint.id,
      message: 'Direct webhook test successful'
    });
    
  } catch (error) {
    console.error('🧪 DEBUG: Direct webhook test FAILED:', error.message);
    console.error('🧪 DEBUG: Full error:', error);
    
    res.status(400).json({
      success: false,
      error: error.message,
      details: 'Check server logs for full error'
    });
  }
});

module.exports = router;