require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const connectDB = require('./utils/database');
const { startTrendingScoreUpdates } = require('./utils/trendingAlgorithm');
const newsletterController = require('./controllers/newsletterController');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

// Import SSL configuration
const sslConfig = require('./utils/ssl');

// Import URL security middleware
const URLSecurity = require('./middleware/urlSecurity');

const app = express();
//const cron = require('node-cron');
//const path = require('path');
//const fs = require('fs');

// Import routes
const articleRoutes = require('./routes/articles');
const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const newsletterRoutes = require('./routes/newsletter');
const subscriberRoutes = require('./routes/newsletter');
const adminRoutes = require('./routes/admin');
const stripeRoutes = require('./routes/stripe'); // FIXED: Changed from stripe-service to stripe
const adsSettingsRoutes = require('./routes/adsSettings');
const userRoutes = require('./routes/users');
const secureAdminRoutes = require('./routes/secureAdmin');

// Import tracking middleware
const { trackPageView } = require('./middleware/tracking');

// Connect to database
connectDB();

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const corsOptions = {
  credentials: true
};

if (process.env.NODE_ENV === 'production') {
  // In production, allow the specific frontend URL and common development URLs
  corsOptions.origin = function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://blog1-frontend.vercel.app', // Your actual frontend URL      
    ].filter(Boolean); // Remove undefined values

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  };
} else {
  // In development, allow localhost
  corsOptions.origin = 'https://blog1-frontend.vercel.app';
}

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 5000, // limit each IP - increased for development
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser());

// Tracking middleware - track all page views
app.use(trackPageView);

// Debug route registration
console.log('🚀 Registering Routes...');

// ===== DEBUG: CHECK ALL ROUTES =====
console.log('\n🔍 DEBUG: Checking all route files...');

// Check ads routes
const adsRoutePath = path.join(__dirname, 'routes', 'ads.js');
console.log('📁 Looking for ads routes at:', adsRoutePath);
console.log('   File exists?', fs.existsSync(adsRoutePath));

// Check stripe routes  
const stripeRoutePath = path.join(__dirname, 'routes', 'stripe.js');
console.log('📁 Looking for stripe routes at:', stripeRoutePath);
console.log('   File exists?', fs.existsSync(stripeRoutePath));

let adRoutes;
if (fs.existsSync(adsRoutePath)) {
  try {
    console.log('✅ File exists! Requiring ads routes...');
    adRoutes = require(adsRoutePath);
    console.log('✅ Successfully required ads routes');
  } catch (error) {
    console.log('❌ ERROR requiring ads routes:', error.message);
    
    // Create a fallback router if ads routes fail to load
    adRoutes = express.Router();
    adRoutes.get('*', (req, res) => {
      res.status(500).json({
        success: false,
        error: 'Ads routes failed to load: ' + error.message
      });
    });
  }
} else {
  console.log('❌ routes/ads.js file not found! Creating fallback...');
  // Create a fallback router
  adRoutes = express.Router();
  adRoutes.get('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Ads routes file not found'
    });
  });
}

// Check if stripe routes file exists and load it properly
if (!fs.existsSync(stripeRoutePath)) {
  console.log('❌ routes/stripe.js file not found! Please create it.');
  console.log('💡 Create a file named stripe.js in your routes folder with the test-connection route.');
}
// ===== END DEBUG =====

// Routes
app.use('/api/articles', articleRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/ads', adRoutes); // Use the (possibly fallback) ads routes
app.use('/api/ads', adsSettingsRoutes); // Ads settings routes
app.use('/api/analytics', analyticsRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/secure', secureAdminRoutes); // Secure admin routes with URL obfuscation
app.use('/api/newsletter', subscriberRoutes);
app.use('/api/ads/stripe', stripeRoutes); // FIXED: Changed from /stripe-service to /stripe
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Debug all registered routes
console.log('\n📍 Registered Routes:');
app._router.stack.forEach((middleware) => {
  if (middleware.name === 'router') {
    console.log(`\n🏗️  Router mounted at: ${middleware.regexp}`);
    if (middleware.handle && middleware.handle.stack) {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods).join(', ').toUpperCase();
          console.log(`   ${methods.padEnd(6)} ${path}`);
        }
      });
    }
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found: ' + req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }
  
  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: `${field} already exists`
    });
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired'
    });
  }
  
  // Default error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
});

const PORT = process.env.PORT || 5000;
const USE_HTTPS = process.env.USE_HTTPS === 'true' || process.env.NODE_ENV === 'production';

// Start server with HTTPS if enabled
const server = USE_HTTPS ? sslConfig.createHTTPSServer(app, PORT) : app.listen(PORT, () => {
  console.log(`\n✅ Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log('⚠️  WARNING: Running in HTTP mode. URLs are not encrypted!');
  console.log('💡 To enable HTTPS, set USE_HTTPS=true in environment variables');
});

if (USE_HTTPS && server) {
  // Start background jobs after HTTPS server is ready
  server.on('listening', () => {
    console.log(`🔒 HTTPS Server running on https://localhost:${PORT}`);
    console.log('✅ URLs are now encrypted with SSL/TLS');
    startBackgroundJobs();
  });
} else if (!USE_HTTPS) {
  // Start background jobs for HTTP server
  startBackgroundJobs();
}

function startBackgroundJobs() {
  // Start background jobs
  startTrendingScoreUpdates();

  // Schedule weekly newsletter delivery (every Sunday at 10 AM)
  cron.schedule('0 10 * * 0', async () => {
    console.log('📧 Starting weekly newsletter delivery...');
    try {
      const sentCount = await newsletterController.sendTrendingNewsletter();
      console.log(`✅ Weekly newsletter sent to ${sentCount} subscribers`);
    } catch (error) {
      console.error('❌ Error sending weekly newsletter:', error);
    }
  });

  // Session cleanup job - run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('🧹 Starting session cleanup...');
    try {
      const { cleanupExpiredSessions } = require('./middleware/tracking');
      const cleanedCount = await cleanupExpiredSessions();

      if (cleanedCount > 0) {
        console.log(`✅ Session cleanup completed: ${cleanedCount} expired sessions cleaned up`);
      } else {
        console.log('ℹ️ Session cleanup completed: No expired sessions found');
      }
    } catch (error) {
      console.error('❌ Error during session cleanup:', error);
    }
  });

  console.log('📅 Newsletter scheduler started - Weekly delivery every Sunday at 10 AM');
  console.log('🧹 Session cleanup scheduler started - Every 30 minutes');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
