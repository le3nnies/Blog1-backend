require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { connectDB, isDBConnected, waitForDB } = require('./utils/database');
const { startTrendingScoreUpdates } = require('./utils/trendingAlgorithm');
const newsletterController = require('./controllers/newsletterController');
const Session = require('./models/Session');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
app.set('trust proxy', true); // IMPORTANT for Render/Vercel

// ===== ENVIRONMENT DETECTION =====
// Force production mode on Render
const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || '';
if (hostname.includes('.onrender.com') && process.env.NODE_ENV !== 'production') {
  console.log('🎯 Render deployment detected, forcing production mode');
  process.env.NODE_ENV = 'production';
}

console.log('🌍 Environment:', process.env.NODE_ENV);
console.log('🏠 Hostname:', hostname);

// ===== DATABASE CONNECTION =====
(async () => {
  console.log('🔗 Connecting to MongoDB...');
  try {
    await connectDB();
    await waitForDB();
    console.log('✅ Database ready');
    startServer();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('⚠️ Starting server with limited functionality...');
    startServer(); // Start server anyway
  }
})();

// ===== MIDDLEWARE SETUP =====
// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser());

// Cookie debug and fix middleware - UPDATED
app.use((req, res, next) => {
  // Detect if we're on Render
  const isRender = req.headers.host?.includes('.onrender.com') || 
                  process.env.RENDER_EXTERNAL_HOSTNAME?.includes('.onrender.com');
  const isProduction = process.env.NODE_ENV === 'production' || isRender;
  
  // Store original cookie functions
  const originalCookie = res.cookie;
  const originalClearCookie = res.clearCookie;
  
  // Override res.cookie
  res.cookie = function(name, value, options = {}) {
    // Final cookie settings
    const finalOptions = {
      ...options,
      httpOnly: true,
      secure: isProduction, // true on Render
      sameSite: isProduction ? 'none' : 'lax',
      path: '/'
    };
    
    // Domain is not set to allow cookies to be scoped to the specific backend domain
    
    // Set maxAge based on cookie type
    if (!finalOptions.maxAge) {
      if (name.includes('auth') || name === 'session_id') {
        finalOptions.maxAge = 2 * 60 * 60 * 1000; // 2 hours
      } else if (name.includes('tracking')) {
        finalOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      }
    }
    
    console.log(`🍪 SET COOKIE: ${name}`);
    console.log('   Options:', {
      secure: finalOptions.secure,
      sameSite: finalOptions.sameSite,
      domain: finalOptions.domain,
      maxAge: finalOptions.maxAge ? `${finalOptions.maxAge / (60 * 60 * 1000)}h` : 'default'
    });
    
    return originalCookie.call(this, name, value, finalOptions);
  };
  
  // Override res.clearCookie
  res.clearCookie = function(name, options = {}) {
    const finalOptions = {
      ...options,
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax'
    };
    
    // Domain is not set to allow cookies to be scoped to the specific backend domain
    
    console.log(`🗑️ CLEAR COOKIE: ${name}`);
    return originalClearCookie.call(this, name, finalOptions);
  };
  
  next();
});

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://blog1-frontend.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173'
    ];
    
    // Allow requests with no origin (like server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    
    // In development, allow all
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In production, check specific origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('🚫 CORS blocked:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Set-Cookie', 'Accept'],
  exposedHeaders: ['Set-Cookie']
};

// Apply CORS
app.use(cors(corsOptions));

// Handle preflight
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250,
  message: { success: false, error: 'Too many requests' },
  skip: (req) => req.path === '/api/health'
});

app.use(limiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== TEST ENDPOINTS =====
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    hostname: req.headers.host,
    isRender: req.headers.host?.includes('.onrender.com') || false
  });
});

// Cookie test endpoints
app.get('/api/test-cookie', (req, res) => {
  const isRender = req.headers.host?.includes('.onrender.com');
  const isProduction = process.env.NODE_ENV === 'production' || isRender;
  
  res.cookie('test_cookie', `render_${isRender}_prod_${isProduction}_${Date.now()}`);
  
  res.json({
    success: true,
    message: 'Test cookie set',
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      isProduction: isProduction,
      isRender: isRender,
      host: req.headers.host
    },
    requestCookies: req.cookies
  });
});

app.get('/api/check-cookies', (req, res) => {
  res.json({
    success: true,
    cookies: req.cookies,
    headers: {
      origin: req.headers.origin,
      cookie: req.headers.cookie,
      host: req.headers.host
    }
  });
});

// ===== DATABASE CHECK MIDDLEWARE =====
app.use((req, res, next) => {
  // Skip DB check for health and test endpoints
  if (req.path.startsWith('/api/health') || 
      req.path.startsWith('/api/test-') || 
      req.path.startsWith('/api/check-')) {
    return next();
  }
  
  if (mongoose.connection.readyState !== 1) {
    console.log('⏳ Database not ready for:', req.path);
    // Still continue, but tracking might not work
  }
  next();
});

// ===== IMPORT AND SETUP MIDDLEWARE =====
let trackPageView, authMiddleware;

const loadMiddleware = () => {
  try {
    // Import tracking
    const tracking = require('./middleware/tracking');
    trackPageView = tracking.trackPageView || tracking;
    
    // Import auth
    const auth = require('./middleware/auth');
    authMiddleware = auth.authMiddleware;
    
    console.log('✅ Middleware loaded');
  } catch (error) {
    console.error('❌ Failed to load middleware:', error.message);
  }
};

// Load middleware immediately
loadMiddleware();

// ===== TRACKING MIDDLEWARE =====
app.use((req, res, next) => {
  // Skip tracking for certain endpoints
  if (req.path.startsWith('/api/health') || 
      req.path.startsWith('/api/test-') || 
      req.path.startsWith('/api/check-') ||
      req.path.startsWith('/uploads/')) {
    return next();
  }
  
  if (trackPageView) {
    trackPageView(req, res, next);
  } else {
    console.log('⚠️ Tracking middleware not loaded');
    next();
  }
});

// ===== LOAD ROUTES =====
const setupRoutes = () => {
  try {
    const articleRoutes = require('./routes/articles');
    const authRoutes = require('./routes/auth');
    const analyticsRoutes = require('./routes/analytics');
    const newsletterRoutes = require('./routes/newsletter');
    const adminRoutes = require('./routes/admin');
    const userRoutes = require('./routes/users');
    
    app.use('/api/articles', articleRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/api/newsletter', newsletterRoutes);
    app.use('/api/admin', authMiddleware, adminRoutes);
    app.use('/api/users', authMiddleware, userRoutes);
    
    console.log('✅ Routes loaded');
  } catch (error) {
    console.error('❌ Failed to load routes:', error.message);
  }
};

// ===== SERVER STARTUP =====
function startServer() {
  // Setup routes
  setupRoutes();
  
  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Route not found'
    });
  });
  
  // Error handler
  app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  });
  
  const PORT = process.env.PORT || 5000;
  
  const server = app.listen(PORT, () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log('🌍 Environment:', process.env.NODE_ENV);
    console.log('🔒 Cookies: secure=true, sameSite=none, domain=backend-specific');
    
    startBackgroundJobs();
  });
  
  // ===== GRACEFUL SHUTDOWN - FIXED =====
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    server.close(async () => {
      console.log('✅ HTTP server closed');
      
      try {
        // Mark active sessions as inactive
        if (mongoose.connection.readyState === 1) {
          const result = await Session.updateMany(
            { isActive: true },
            { isActive: false, endTime: new Date() }
          );
          console.log(`✅ ${result.modifiedCount} sessions marked inactive`);
        }
      } catch (error) {
        console.error('❌ Error cleaning sessions:', error.message);
      }
      
      try {
        // Close MongoDB connection properly
        await mongoose.disconnect();
        console.log('✅ MongoDB connection closed');
      } catch (error) {
        console.error('❌ Error closing MongoDB:', error.message);
      }
      
      process.exit(0);
    });
  });
  
  return server;
}

// ===== BACKGROUND JOBS =====
function startBackgroundJobs() {
  console.log('🔄 Starting background jobs...');
  
  // Start trending updates
  if (mongoose.connection.readyState === 1) {
    startTrendingScoreUpdates();
    console.log('✅ Trending score updates started');
  } else {
    console.log('⏳ Database not ready for trending updates');
  }
  
  // Session cleanup job
  cron.schedule('*/15 * * * *', async () => {
    console.log('🧹 Starting session cleanup...');
    try {
      if (mongoose.connection.readyState === 1) {
        const { cleanupExpiredSessions } = require('./models/Session');
        const result = await cleanupExpiredSessions();
        if (result > 0) {
          console.log(`✅ Cleaned ${result} expired sessions`);
        }
      }
    } catch (error) {
      console.error('❌ Session cleanup error:', error.message);
    }
  });
  
  console.log('📅 Background jobs scheduled');
}

module.exports = { app };
