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
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
app.set('trust proxy', true); // IMPORTANT for Render/Vercel

// ===== DATABASE CONNECTION FIRST =====
(async () => {
  console.log('🔗 Connecting to MongoDB...');
  const dbConnection = await connectDB();

  // Wait for DB to be ready before starting server
  if (dbConnection) {
    try {
      await waitForDB();
      console.log('✅ Database ready, starting server...');
      startServer();
    } catch (error) {
      console.error('❌ Database connection timeout:', error.message);
      console.log('⚠️ Starting server with limited functionality...');
      startServer(); // Start server anyway
    }
  } else {
    console.log('⚠️ Starting server without database connection...');
    startServer();
  }
})();

// ===== MIDDLEWARE SETUP =====
// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser());

// Cookie debug and fix middleware
app.use((req, res, next) => {
  // Store original cookie functions
  const originalCookie = res.cookie;
  const originalClearCookie = res.clearCookie;
  
  // Override res.cookie for debugging and fixing
  res.cookie = function(name, value, options = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Fixed cookie options for production
    const fixedOptions = {
      ...options,
      httpOnly: true,
      secure: isProduction, // true in production
      sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site
      path: '/',
      maxAge: options.maxAge || (name.includes('auth') ? 2 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000)
    };
    
    // Add domain for production cookies (Render)
    if (isProduction && !options.domain) {
      fixedOptions.domain = '.onrender.com';
    }
    
    console.log(`🍪 SET COOKIE: ${name} = ${typeof value === 'string' ? value.substring(0, 20) + '...' : 'object'}`);
    console.log('   Options:', {
      secure: fixedOptions.secure,
      sameSite: fixedOptions.sameSite,
      httpOnly: fixedOptions.httpOnly,
      maxAge: fixedOptions.maxAge,
      domain: fixedOptions.domain || 'default'
    });
    
    return originalCookie.call(this, name, value, fixedOptions);
  };
  
  // Override res.clearCookie
  res.clearCookie = function(name, options = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const fixedOptions = {
      ...options,
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax'
    };
    
    if (isProduction && !options.domain) {
      fixedOptions.domain = '.onrender.com';
    }
    
    console.log(`🗑️ CLEAR COOKIE: ${name}`);
    return originalClearCookie.call(this, name, fixedOptions);
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
    
    // In development, allow all
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In production, check specific origins
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('🚫 CORS blocked:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Set-Cookie'],
  exposedHeaders: ['Set-Cookie']
};

// Apply CORS
app.use(cors(corsOptions));

// Handle preflight
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Disable for API
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 250,
  message: { success: false, error: 'Too many requests' }
});

app.use(limiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== IMPORT MIDDLEWARE (AFTER DB CONNECTION) =====
let trackPageView, authMiddleware, adminMiddleware, optionalAuthMiddleware, COOKIE_NAMES;

// Dynamic imports to ensure DB is connected
const loadMiddleware = () => {
  const tracking = require('./middleware/tracking');
  const auth = require('./middleware/auth');
  
  trackPageView = tracking.trackPageView || tracking;
  authMiddleware = auth.authMiddleware;
  adminMiddleware = auth.adminMiddleware;
  optionalAuthMiddleware = auth.optionalAuthMiddleware;
  COOKIE_NAMES = auth.COOKIE_NAMES || {
    AUTH: 'session_id',
    TRACKING: 'tracking_session_id'
  };
  
  console.log('✅ Middleware loaded successfully');
};

// ===== ROUTES =====
// First, add a simple health check that doesn't need DB
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'connecting'
  });
});

// Test endpoints
app.get('/api/test-cookie', (req, res) => {
  const testValue = `test_${Date.now()}`;
  
  res.cookie('test_cookie', testValue);
  
  res.json({
    success: true,
    message: 'Test cookie set',
    value: testValue,
    requestCookies: req.cookies
  });
});

app.get('/api/check-cookies', (req, res) => {
  res.json({
    success: true,
    cookies: req.cookies,
    headers: {
      origin: req.headers.origin,
      cookie: req.headers.cookie
    }
  });
});

// Wait for DB before loading other routes
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.log('⏳ Waiting for database connection...');
    const checkConnection = () => {
      if (mongoose.connection.readyState === 1) {
        next();
      } else {
        setTimeout(checkConnection, 100);
      }
    };
    checkConnection();
  } else {
    next();
  }
});

// Load middleware when DB is ready
app.use((req, res, next) => {
  if (!trackPageView) {
    loadMiddleware();
  }
  next();
});

// Apply tracking middleware
app.use((req, res, next) => {
  // Skip tracking for health check
  if (req.path === '/api/health' || req.path.startsWith('/uploads/')) {
    return next();
  }
  
  if (trackPageView) {
    trackPageView(req, res, next);
  } else {
    next();
  }
});

// Import routes dynamically
const setupRoutes = () => {
  const articleRoutes = require('./routes/articles');
  const authRoutes = require('./routes/auth');
  const analyticsRoutes = require('./routes/analytics');
  const newsletterRoutes = require('./routes/newsletter');
  const adminRoutes = require('./routes/admin');
  const userRoutes = require('./routes/users');
  
  // Apply routes
  app.use('/api/articles', articleRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/newsletter', newsletterRoutes);
  app.use('/api/admin', authMiddleware, adminRoutes);
  app.use('/api/users', authMiddleware, userRoutes);
  
  console.log('✅ Routes loaded successfully');
};

// ===== SERVER STARTUP FUNCTION =====
function startServer() {
  // Load middleware before setting up routes
  if (!trackPageView) {
    loadMiddleware();
  }

  // Setup routes after DB is connected
  setupRoutes();
  
  const PORT = process.env.PORT || 5000;
  
  const server = app.listen(PORT, () => {
    console.log(`\n✅ Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log('📊 Session Model: Unified');
    console.log('🍪 Cookie Settings:');
    console.log(`   - Production: ${process.env.NODE_ENV === 'production'}`);
    console.log(`   - Secure: ${process.env.NODE_ENV === 'production'}`);
    console.log(`   - SameSite: ${process.env.NODE_ENV === 'production' ? 'none' : 'lax'}`);
    console.log(`   - Domain: ${process.env.NODE_ENV === 'production' ? '.onrender.com' : 'localhost'}`);
    
    startBackgroundJobs();
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    server.close(async () => {
      console.log('✅ HTTP server closed');
      
      try {
        // Mark active sessions as inactive
        const Session = mongoose.model('Session');
        const result = await Session.updateMany(
          { isActive: true },
          { isActive: false, endTime: new Date() }
        );
        console.log(`✅ ${result.modifiedCount} sessions marked inactive`);
      } catch (error) {
        console.error('❌ Error cleaning sessions:', error.message);
      }
      
      mongoose.connection.close(false, () => {
        console.log('✅ MongoDB connection closed');
        process.exit(0);
      });
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
    console.log('⏳ Waiting for DB before starting trending updates...');
    const interval = setInterval(() => {
      if (mongoose.connection.readyState === 1) {
        clearInterval(interval);
        startTrendingScoreUpdates();
        console.log('✅ Trending score updates started');
      }
    }, 1000);
  }
  
  // Session cleanup job
  cron.schedule('*/15 * * * *', async () => {
    console.log('🧹 Starting session cleanup...');
    try {
      const { cleanupExpiredSessions } = require('./middleware/auth');
      const result = await cleanupExpiredSessions();
      if (result > 0) {
        console.log(`✅ Cleaned ${result} expired sessions`);
      }
    } catch (error) {
      console.error('❌ Session cleanup error:', error.message);
    }
  });
  
  console.log('📅 Background jobs scheduled');
}

module.exports = { app };
