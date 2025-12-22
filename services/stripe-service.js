const Stripe = require('stripe');
const stripeConfig = require('../config/stripe-config');

// Import your MongoDB models (you'll need to create these)
const Transaction = require('../models/Transaction');
const Campaign = require('../models/AdCampaign');

class StripeService {
  constructor() {
    // Initialize with empty key, will be set dynamically
    this.stripe = null;
  }

  // Initialize Stripe with secret key
initializeStripe(secretKey = null) {
  console.log('🔧 [StripeService] initializeStripe called with:', { 
    hasSecretKey: !!secretKey,
    hasStripeConfig: !!stripeConfig,
    hasStripeConfigSecret: !!(stripeConfig && stripeConfig.secretKey)
  });
  
  const key = secretKey || (stripeConfig ? stripeConfig.secretKey : null);
  
  if (!key) {
    const error = new Error('Stripe secret key is required');
    console.error('❌ [StripeService] No secret key found:', error.message);
    throw error;
  }
  
  console.log('✅ [StripeService] Creating Stripe instance with key:', key.substring(0, 20) + '...');
  
  this.stripe = new Stripe(key, {
    apiVersion: '2023-10-16'
  });
  
  return this.stripe;
}

  // Test Stripe connection
  async testConnection(secretKey = null) {
    try {
      const stripe = this.initializeStripe(secretKey);
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
      console.error('Stripe connection test failed:', error);
      return {
        success: false,
        valid: false,
        error: error.message
      };
    }
  }

  // In your stripe-service.js - add these debug logs

// In your stripe-service.js - update the generateWebhook method

async generateWebhook(webhookUrl, secretKey = null) {
  try {
    console.log('🔧 [StripeService] generateWebhook called with:', { 
      webhookUrl, 
      hasSecretKey: !!secretKey,
      secretKeyPreview: secretKey ? secretKey.substring(0, 20) + '...' : 'none'
    });
    
    // Step 1: Initialize Stripe
    console.log('🔧 [StripeService] Step 1: Initializing Stripe...');
    const stripe = this.initializeStripe(secretKey);
    console.log('✅ [StripeService] Step 1: Stripe instance created successfully');
    
    // Step 2: Prepare webhook data
    console.log('🔧 [StripeService] Step 2: Preparing webhook data...');
    const webhookData = {
      url: webhookUrl,
      enabled_events: [
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'charge.succeeded',
        'charge.failed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
      ],
    };
    console.log('✅ [StripeService] Step 2: Webhook data prepared:', webhookData);
    
    // Step 3: Create webhook endpoint
    console.log('🔧 [StripeService] Step 3: Creating webhook endpoint via Stripe API...');
    const webhookEndpoint = await stripe.webhookEndpoints.create(webhookData);
    console.log('✅ [StripeService] Step 3: Webhook endpoint created successfully:', {
      id: webhookEndpoint.id,
      url: webhookEndpoint.url,
      hasSecret: !!webhookEndpoint.secret
    });
    
    // Step 4: Return success
    console.log('✅ [StripeService] generateWebhook completed successfully');
    return {
      success: true,
      webhookSecret: webhookEndpoint.secret,
      webhookId: webhookEndpoint.id,
      url: webhookEndpoint.url
    };
    
  } catch (error) {
    console.error('❌ [StripeService] generateWebhook FAILED at step:', 'Unknown - error before step logging');
    console.error('❌ [StripeService] Error type:', error.constructor.name);
    console.error('❌ [StripeService] Error message:', error.message);
    console.error('❌ [StripeService] Error code:', error.code);
    console.error('❌ [StripeService] Error stack:', error.stack);
    
    // Check for specific Stripe error properties
    if (error.type) {
      console.error('❌ [StripeService] Stripe error type:', error.type);
    }
    if (error.raw) {
      console.error('❌ [StripeService] Stripe raw error:', error.raw);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

  // Verify webhook signature
  async verifyWebhookSignature(payload, signature, webhookSecret = null) {
    try {
      const secret = webhookSecret || stripeConfig.webhookSecret;
      if (!secret) {
        throw new Error('Webhook secret is required');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        secret
      );

      return { success: true, event };
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create payment intent and record in database
  async createPaymentIntent(amount, currency, userId, userEmail, campaignId = null, secretKey = null) {
    try {
      const stripe = this.initializeStripe(secretKey);

      if (!amount || amount < 100) {
        throw new Error('Valid amount is required (minimum $1.00)');
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        metadata: {
          campaignId: campaignId || 'unknown',
          userId: userId,
          userEmail: userEmail
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Record transaction in database (pending status)
      const transaction = new Transaction({
        stripePaymentIntentId: paymentIntent.id,
        userId: userId,
        userEmail: userEmail,
        campaignId: campaignId,
        amount: paymentIntent.amount / 100, // Convert back to dollars
        currency: paymentIntent.currency,
        status: 'pending',
        paymentMethod: 'stripe',
        metadata: paymentIntent.metadata
      });

      await transaction.save();

      return {
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        transactionId: transaction._id
      };
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  }

  // Handle successful payment (webhook)
  async handleSuccessfulPayment(paymentIntent) {
    try {
      // Find and update transaction in database
      const transaction = await Transaction.findOneAndUpdate(
        { stripePaymentIntentId: paymentIntent.id },
        {
          status: 'completed',
          paidAt: new Date(),
          stripeChargeId: paymentIntent.latest_charge,
          receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
          paymentMethodDetails: {
            type: paymentIntent.payment_method_types[0],
            card: paymentIntent.charges?.data[0]?.payment_method_details?.card
          },
          rawStripeData: paymentIntent // Store complete Stripe data for reference
        },
        { new: true }
      );

      // If transaction is linked to a campaign, update campaign status
      if (transaction && transaction.campaignId) {
        await Campaign.findByIdAndUpdate(transaction.campaignId, {
          status: 'active',
          paid: true,
          paymentDate: new Date()
        });
      }

      console.log(`✅ Payment completed for transaction: ${transaction._id}`);
      return transaction;
    } catch (error) {
      console.error('Error handling successful payment:', error);
      throw error;
    }
  }

  // Handle failed payment (webhook)
  async handleFailedPayment(paymentIntent) {
    try {
      const transaction = await Transaction.findOneAndUpdate(
        { stripePaymentIntentId: paymentIntent.id },
        {
          status: 'failed',
          failedAt: new Date(),
          failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
          rawStripeData: paymentIntent
        },
        { new: true }
      );

      console.log(`❌ Payment failed for transaction: ${transaction?._id}`);
      return transaction;
    } catch (error) {
      console.error('Error handling failed payment:', error);
      throw error;
    }
  }

  // Process webhook events
  async processWebhookEvent(payload, signature, webhookSecret = null) {
    try {
      const verification = await this.verifyWebhookSignature(payload, signature, webhookSecret);
      
      if (!verification.success) {
        throw new Error(verification.error);
      }

      const event = verification.event;
      console.log(`🔄 Processing webhook: ${event.type}`);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handleSuccessfulPayment(event.data.object);
          break;
          
        case 'payment_intent.payment_failed':
          await this.handleFailedPayment(event.data.object);
          break;
          
        case 'charge.succeeded':
          // Additional charge handling if needed
          console.log('Charge succeeded:', event.data.object.id);
          break;

        case 'payment_intent.created':
          console.log('Payment intent created:', event.data.object.id);
          break;

        case 'payment_intent.canceled':
          console.log('Payment intent canceled:', event.data.object.id);
          break;
          
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return { success: true, event: event.type };
    } catch (error) {
      console.error('Webhook processing failed:', error);
      throw error;
    }
  }

  // Get transaction history for user
  async getUserTransactions(userId, limit = 10) {
    try {
      const transactions = await Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-rawStripeData'); // Exclude large raw data unless needed

      return transactions;
    } catch (error) {
      console.error('Error fetching user transactions:', error);
      throw error;
    }
  }

  // Refund payment
  async refundPayment(paymentIntentId, amount = null, secretKey = null) {
    try {
      const stripe = this.initializeStripe(secretKey);
      
      const refundData = { payment_intent: paymentIntentId };
      if (amount) refundData.amount = Math.round(amount * 100);

      const refund = await stripe.refunds.create(refundData);

      // Update transaction status in database
      await Transaction.findOneAndUpdate(
        { stripePaymentIntentId: paymentIntentId },
        {
          status: 'refunded',
          refundedAt: new Date(),
          refundId: refund.id,
          refundAmount: refund.amount / 100
        }
      );

      return refund;
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }

  // Get Stripe account balance
  async getAccountBalance(secretKey = null) {
    try {
      const stripe = this.initializeStripe(secretKey);
      const balance = await stripe.balance.retrieve();
      
      return {
        success: true,
        available: balance.available,
        pending: balance.pending,
        livemode: balance.livemode
      };
    } catch (error) {
      console.error('Error fetching account balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // List all webhook endpoints
  async listWebhookEndpoints(secretKey = null) {
    try {
      const stripe = this.initializeStripe(secretKey);
      const endpoints = await stripe.webhookEndpoints.list();
      
      return {
        success: true,
        endpoints: endpoints.data
      };
    } catch (error) {
      console.error('Error listing webhook endpoints:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete webhook endpoint
  async deleteWebhookEndpoint(webhookId, secretKey = null) {
    try {
      const stripe = this.initializeStripe(secretKey);
      const deleted = await stripe.webhookEndpoints.del(webhookId);
      
      return {
        success: true,
        deleted: deleted.deleted,
        message: 'Webhook endpoint deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting webhook endpoint:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new StripeService();