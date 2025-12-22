const stripeConfig = {
  // Stripe Keys (from your ads settings)
  publicKey: process.env.STRIPE_PUBLIC_KEY || "",
  secretKey: process.env.STRIPE_SECRET_KEY || "",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  
  // Payment Settings
  currency: 'usd',
  defaultCommissionRate: 30,
  taxRate: 0,
  
  // Webhook Events to listen for
  webhookEvents: [
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.succeeded', 
    'charge.failed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ],
  
  // Success/Cancel URLs
  successUrl: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl: `${process.env.BASE_URL}/cancel`
};

module.exports = stripeConfig;