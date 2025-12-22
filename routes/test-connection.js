// routes/stripe.js (Express route)
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Test connection route
router.post('/test-connection', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { stripePublicKey, stripeSecretKey } = req.body;

    if (!stripeSecretKey) {
      return res.status(400).json({
        valid: false,
        message: 'Stripe secret key is required'
      });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16'
    });

    const balance = await stripe.balance.retrieve();
    
    res.status(200).json({
      valid: true,
      message: 'Stripe connection successful',
      account: {
        livemode: balance.livemode,
        currency: balance.available[0]?.currency || 'usd'
      }
    });

  } catch (error) {
    console.error('Stripe connection test failed:', error);
    res.status(400).json({
      valid: false,
      message: error.message || 'Failed to connect to Stripe'
    });
  }
});

module.exports = router;