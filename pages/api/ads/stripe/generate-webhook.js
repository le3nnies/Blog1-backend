import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { webhookUrl, stripeSecretKey } = req.body;

    // In a real app, you'd get this from your database/configuration
    const stripe = new Stripe(stripeSecretKey || process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });

    // Create webhook endpoint
    const webhookEndpoint = await stripe.webhookEndpoints.create({
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
    });

    return res.status(200).json({
      webhookSecret: webhookEndpoint.secret,
      webhookId: webhookEndpoint.id,
      url: webhookEndpoint.url
    });

  } catch (error) {
    console.error('Failed to create webhook:', error);
    
    return res.status(400).json({
      error: error.message || 'Failed to create webhook endpoint'
    });
  }
}