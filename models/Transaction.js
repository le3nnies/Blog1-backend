const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Stripe Identifiers
  stripePaymentIntentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  stripeChargeId: {
    type: String,
    sparse: true
  },
  refundId: {
    type: String,
    sparse: true
  },

  // User Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userEmail: {
    type: String,
    required: true
  },

  // Campaign Information (if applicable)
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    sparse: true
  },

  // Payment Details
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  refundAmount: {
    type: Number,
    default: 0
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'canceled'],
    default: 'pending'
  },

  // Payment Method
  paymentMethod: {
    type: String,
    default: 'stripe'
  },
  paymentMethodDetails: {
    type: mongoose.Schema.Types.Mixed
  },

  // Timestamps
  paidAt: {
    type: Date
  },
  failedAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  },

  // Additional Info
  failureReason: {
    type: String
  },
  receiptUrl: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },

  // Raw Stripe data for debugging
  rawStripeData: {
    type: mongoose.Schema.Types.Mixed
  }

}, {
  timestamps: true
});

// Index for common queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);