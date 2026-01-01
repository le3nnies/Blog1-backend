// server.js - COMPLETELY FIXED VERSION
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

// Import tracking middleware
const { trackPageView } = require('./middleware/tracking');

const app = express();

// ============================================
// 1. FIRST: Initialize server without DB dependency
// ============================================

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 5000,
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

// ============================================
// 2. MODIFIED TRACKING MIDDLEWARE: Safe version
// ============================================

// Create a safe version of trackPageView that won't crash if DB is down
const safeTrackPageView = async (req, res, next) => {
  try {
    // Check if DB is actually connected before tracking
    if (mongoose.connection.readyState !== 1) {
      // DB not connected, skip tracking but continue request
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️  Tracking skipped: MongoDB not connected');
      }
      return next();
    }
    
    // DB is connected, use the real tracking
    return await trackPageView(req, res, next);
  } catch (error) {
    // Don't crash the request if tracking fails
    console.error('❌ Tracking error (non-fatal):', error.message);
    return next();
  }
};

app.use(safeTrackPageView);

// ============================================
// 3. DEBUG: Check all route files
// ============================================

console.log('🚀 Registering Routes...');
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

// Check if stripe routes file exists
if (!fs.existsSync(stripeRoutePath)) {
  console.log('⚠️  routes/stripe.js file not found! Creating placeholder...');
}

// ============================================
// 4. DATABASE CONNECTION & SERVER STARTUP
// ============================================

async function initializeServer() {
  console.log('\n🔗 Initializing MongoDB connection...');
  
  try {
    // Connect to database
    await connectDB();
    
    // Check connection status
    const dbStatus = mongoose.connection.readyState;
    const statusMessages = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    console.log(`📊 MongoDB Status: ${statusMessages[dbStatus] || 'unknown'}`);
    
    if (dbStatus === 1) {
      console.log('✅ MongoDB Atlas connection established');
    } else {
      console.log('⚠️  MongoDB not fully connected, server will run in limited mode');
      console.log('💡 Check:');
      console.log('   1. MONGODB_URI in Render environment variables');
      console.log('   2. IP whitelist in MongoDB Atlas (add 0.0.0.0/0 for testing)');
      console.log('   3. Database user credentials');
    }
    
    // ============================================
    // 5. REGISTER ROUTES (after DB connection attempt)
    // ============================================
    
    app.use('/api/articles', articleRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/ads', adRoutes);
    app.use('/api/ads', adsSettingsRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/api/newsletter', newsletterRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/newsletter', subscriberRoutes);
    app.use('/api/ads/stripe', stripeRoutes);
    app.use('/api/users', userRoutes);
    
    // Health check endpoint with DB status
    app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        database: {
          connected: mongoose.connection.readyState === 1,
          status: statusMessages[mongoose.connection.readyState]
        },
        memory: process.memoryUsage(),
        uptime: process.uptime()
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
        availableRoutes: [
          '/api/health',
          '/api/articles',
          '/api/auth',
          '/api/analytics',
          '/api/newsletter'
        ]
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
      
      // Mongoose connection errors
      if (error.name === 'MongooseError') {
        return res.status(503).json({
          success: false,
          error: 'Database temporarily unavailable',
          message: 'Please try again in a few moments'
        });
      }
      
      // Default error
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    });
    
    // ============================================
    // 6. START SERVER
    // ============================================
    
    const PORT = process.env.PORT || 5000;
    
    const server = app.listen(PORT, () => {
      console.log(`\n✅ Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`📊 Database Status: ${mongoose.connection.readyState === 1 ? 'CONNECTED ✅' : 'DISCONNECTED ⚠️'}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
      
      // Only start background jobs if DB is connected
      if (mongoose.connection.readyState === 1) {
        console.log('🚀 Starting background jobs...');
        startTrendingScoreUpdates();
        
        // Schedule weekly newsletter delivery (every Sunday at 10 AM)
        cron.schedule('0 10 * * 0', async () => {
          console.log('📧 Starting weekly newsletter delivery...');
          try {
            if (mongoose.connection.readyState === 1) {
              const sentCount = await newsletterController.sendTrendingNewsletter();
              console.log(`✅ Weekly newsletter sent to ${sentCount} subscribers`);
            } else {
              console.log('⚠️  Skipping newsletter - DB not connected');
            }
          } catch (error) {
            console.error('❌ Error sending weekly newsletter:', error);
          }
        });
        
        // Session cleanup job - run every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
          console.log('🧹 Starting session cleanup...');
          try {
            if (mongoose.connection.readyState === 1) {
              const { cleanupExpiredSessions } = require('./middleware/tracking');
              const cleanedCount = await cleanupExpiredSessions();
              
              if (cleanedCount > 0) {
                console.log(`✅ Session cleanup completed: ${cleanedCount} expired sessions cleaned up`);
              } else {
                console.log('ℹ️ Session cleanup completed: No expired sessions found');
              }
            } else {
              console.log('⚠️  Skipping session cleanup - DB not connected');
            }
          } catch (error) {
            console.error('❌ Error during session cleanup:', error);
          }
        });
        
        console.log('📅 Newsletter scheduler started - Weekly delivery every Sunday at 10 AM');
        console.log('🧹 Session cleanup scheduler started - Every 30 minutes');
      } else {
        console.log('⚠️  Background jobs DISABLED - MongoDB not connected');
      }
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('HTTP server closed');
        if (mongoose.connection.readyState === 1) {
          mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      });
    });
    
    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      // Don't exit in production - let the server continue
      if (process.env.NODE_ENV === 'production') {
        console.log('Continuing despite uncaught exception...');
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize server:', error.message);
    console.log('⚠️  Server will start in limited mode without database');
    
    // Even if DB fails, start the server with basic routes
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`⚠️  Server running in LIMITED mode on port ${PORT} (No database)`);
      console.log('💡 Check your MongoDB Atlas configuration and restart');
    });
  }
}

// Start everything
initializeServer();

module.exports = app;