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
app.set('trust proxy', true);

// Import routes
const articleRoutes = require('./routes/articles');
const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const newsletterRoutes = require('./routes/newsletter');
const subscriberRoutes = require('./routes/newsletter');
const adminRoutes = require('./routes/admin');
const stripeRoutes = require('./routes/stripe');
const adsSettingsRoutes = require('./routes/adsSettings');
const userRoutes = require('./routes/users');
const secureAdminRoutes = require('./routes/secureAdmin');

// Import unified session middleware
const { trackPageView } = require('./middleware/tracking'); // This now creates tracking sessions only
const { authMiddleware, adminMiddleware, optionalAuthMiddleware } = require('./middleware/auth');
const { COOKIE_NAMES } = require('./middleware/auth');

// Import session cleanup function
const { cleanupExpiredSessions } = require('./models/Session');

// Connect to database
connectDB();

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  }
}));

// CORS configuration - IMPORTANT: Enhanced for session cookies
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://blog1-frontend.vercel.app',
      'http://localhost:3000', // For local development
      'http://localhost:5173', // Vite dev server
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173'
    ].filter(Boolean);

    if (allowedOrigins.length === 0) {
      console.warn('⚠️ No allowed origins configured in CORS');
    }

    // Allow all origins in development for testing
    if (process.env.NODE_ENV === 'development') {
      console.log(`🌐 Development CORS allowing origin: ${origin || 'no origin'}`);
      return callback(null, true);
    }

    // In production, check against allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('🚫 CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // REQUIRED for cookies/sessions
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'Set-Cookie'],
  exposedHeaders: ['Set-Cookie'], // Allow frontend to see Set-Cookie header
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Rate limiting - adjusted for session tracking
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 250 : 1000, // Increased for tracking sessions
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  skip: (req) => {
    // Skip rate limiting for certain paths or based on session type
    const isHealthCheck = req.path === '/api/health';
    const isPublicAsset = req.path.startsWith('/uploads/');
    return isHealthCheck || isPublicAsset;
  }
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware - critical for session handling
app.use(cookieParser());

// IMPORTANT: Session Middleware Order
console.log('🔐 Setting up session middleware in correct order...');

// 1. FIRST: Tracking middleware for ALL visitors
// This creates tracking sessions for anonymous users
console.log('📊 1. Tracking middleware (for all visitors)...');
app.use(trackPageView);

// Debug middleware to see what sessions are present
app.use((req, res, next) => {
  console.log('🕵️‍♂️ Session Debug Middleware:');
  console.log('  Cookies:', Object.keys(req.cookies || {}));
  console.log('  Has tracking cookie?', !!req.cookies[COOKIE_NAMES.TRACKING]);
  console.log('  Has auth cookie?', !!req.cookies[COOKIE_NAMES.AUTH]);
  console.log('  IP:', req.ip);
  console.log('  User Agent:', req.headers['user-agent']?.substring(0, 50) + '...');
  next();
});

// 2. Optional auth for certain routes (like getting current user)
// This runs after tracking but before specific route handlers

// Routes registration
console.log('\n🚀 Registering Routes...');

// Debug route registration
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

// ===== ROUTE REGISTRATION =====
console.log('\n📍 Registering Routes with Session Handling...');

// Public routes (tracking sessions only)
app.use('/api/analytics', analyticsRoutes); // Analytics doesn't require auth

// Auth routes (login/logout - tracking sessions can be converted here)
app.use('/api/auth', authRoutes);

// Article routes (mixed - some public, some protected)
app.use('/api/articles', articleRoutes);

// Newsletter routes (public subscription)
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/newsletter', subscriberRoutes);

// Ads routes
app.use('/api/ads', adRoutes);
app.use('/api/ads', adsSettingsRoutes);

// Stripe routes
app.use('/api/ads/stripe', stripeRoutes);

// User routes (require authentication)
app.use('/api/users', authMiddleware, userRoutes);

// Admin routes (require authentication AND admin role)
app.use('/api/admin', authMiddleware, adminRoutes);

// Secure admin routes with URL obfuscation
app.use('/api/admin/secure', authMiddleware, adminMiddleware, secureAdminRoutes);

// Health check endpoint (no auth required, but still tracked)
app.get('/api/health', (req, res) => {
  const sessionInfo = {
    hasTrackingSession: !!req.cookies[COOKIE_NAMES.TRACKING],
    hasAuthSession: !!req.cookies[COOKIE_NAMES.AUTH],
    sessionModel: 'unified',
    environment: process.env.NODE_ENV
  };
  
  res.json({
    success: true,
    message: 'Server is running with unified session model',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    session: sessionInfo
  });
});

// Session info endpoint (for debugging)
app.get('/api/session-info', optionalAuthMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      cookies: Object.keys(req.cookies || {}),
      sessionType: req.sessionType || 'none',
      hasTrackingCookie: !!req.cookies[COOKIE_NAMES.TRACKING],
      hasAuthCookie: !!req.cookies[COOKIE_NAMES.AUTH],
      user: req.user ? {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role
      } : null,
      session: req.session ? {
        id: req.session.sessionId,
        type: req.session.sessionType,
        userId: req.session.userId,
        isAuthenticated: req.session.isAuthenticated
      } : null
    }
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
    error: 'Route not found: ' + req.originalUrl,
    sessionTip: 'Are you using the correct session type? Tracking sessions cannot access protected routes.'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // Session-related errors
  if (error.message && error.message.includes('session')) {
    return res.status(401).json({
      success: false,
      error: 'Session error',
      message: error.message,
      tip: 'Try logging in again or clearing your cookies.'
    });
  }
  
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
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    sessionModel: 'unified'
  });
});

const PORT = process.env.PORT || 5000;
const USE_HTTPS = process.env.USE_HTTPS === 'true' || process.env.NODE_ENV === 'production';

// Start server with HTTPS if enabled
const server = USE_HTTPS ? sslConfig.createHTTPSServer(app, PORT) : app.listen(PORT, () => {
  console.log(`\n✅ Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log('📊 Session Model: Unified (tracking + authentication)');
  console.log('🍪 Cookie Names:');
  console.log(`   - Auth: ${COOKIE_NAMES.AUTH} (2h expiry)`);
  console.log(`   - Tracking: ${COOKIE_NAMES.TRACKING} (30d expiry)`);
  
  if (!USE_HTTPS) {
    console.log('⚠️  WARNING: Running in HTTP mode. URLs are not encrypted!');
    console.log('💡 To enable HTTPS, set USE_HTTPS=true in environment variables');
  }
  
  startBackgroundJobs();
});

if (USE_HTTPS && server) {
  // Start background jobs after HTTPS server is ready
  server.on('listening', () => {
    console.log(`🔒 HTTPS Server running on https://localhost:${PORT}`);
    console.log('✅ URLs are now encrypted with SSL/TLS');
  });
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

  // Enhanced Session cleanup job - run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('🧹 Starting session cleanup...');
    try {
      const cutoffTime = new Date(Date.now() - (8 * 60 * 60 * 1000)); // 8 hours max
      
      // Clean up expired sessions
      const result = await cleanupExpiredSessions();
      
      // Also clean up very old sessions (older than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
      const oldSessions = await mongoose.model('Session').deleteMany({
        endTime: { $lt: thirtyDaysAgo },
        isActive: false
      });
      
      if (oldSessions.deletedCount > 0) {
        console.log(`🗑️  Deleted ${oldSessions.deletedCount} old inactive sessions`);
      }
      
      if (result > 0) {
        console.log(`✅ Session cleanup completed: ${result} expired sessions cleaned up`);
      } else {
        console.log('ℹ️ Session cleanup completed: No expired sessions found');
      }
    } catch (error) {
      console.error('❌ Error during session cleanup:', error);
    }
  });

  console.log('📅 Newsletter scheduler started - Weekly delivery every Sunday at 10 AM');
  console.log('🧹 Session cleanup scheduler started - Every 15 minutes');
  console.log('🔥 Trending score updates running in background');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Clean up any active sessions on shutdown
  mongoose.model('Session').updateMany(
    { isActive: true },
    { 
      isActive: false,
      endTime: new Date(),
      duration: { $round: [{ $subtract: [new Date(), '$startTime'] }, 1000] }
    }
  ).then(() => {
    console.log('✅ All active sessions marked as inactive');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Error cleaning up sessions on shutdown:', error);
    process.exit(1);
  });
});

// Export for testing
module.exports = { app, server };
