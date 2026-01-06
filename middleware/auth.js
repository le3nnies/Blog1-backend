// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { Session, SESSION_CONFIG } = require('../models/Session');

// Get the appropriate cookie name based on config
const AUTH_COOKIE_NAME = SESSION_CONFIG?.COOKIE_NAMES?.AUTH || 'session_id';
const TRACKING_COOKIE_NAME = SESSION_CONFIG?.COOKIE_NAMES?.TRACKING || 'tracking_session_id';

// Helper to get session from store with session type validation
const getAuthSessionFromStore = async (sessionId) => {
  try {
    console.log('Looking up auth session:', sessionId);
    
    const session = await Session.findOne({ 
      sessionId, 
      isActive: true,
      sessionType: 'authentication',
      isAuthenticated: true
    });
    
    if (session) {
      console.log('Found auth session:', {
        sessionId: session.sessionId,
        userId: session.userId,
        sessionType: session.sessionType,
        isAuthenticated: session.isAuthenticated
      });
    } else {
      console.log('No valid auth session found for:', sessionId);
    }
    
    return session;
  } catch (error) {
    console.error('Session lookup error:', error);
    return null;
  }
};

// Main auth middleware - only allows authenticated sessions
exports.authMiddleware = async (req, res, next) => {
  console.log('Auth middleware checking for session cookie...');
  
  // Check for auth session cookie first
  const sessionId = req.cookies && req.cookies[AUTH_COOKIE_NAME];
  
  // Also check for tracking cookie (for debugging/info purposes)
  const trackingCookie = req.cookies && req.cookies[TRACKING_COOKIE_NAME];
  
  console.log('Cookies found:', {
    hasAuthCookie: !!sessionId,
    hasTrackingCookie: !!trackingCookie,
    authCookieName: AUTH_COOKIE_NAME,
    trackingCookieName: TRACKING_COOKIE_NAME,
    allCookies: Object.keys(req.cookies || {})
  });
  
  // If no auth session found
  if (!sessionId) {
    console.log('No auth session cookie found, checking if tracking session exists...');
    
    if (trackingCookie) {
      console.log('User has tracking session but no auth session - not authenticated');
    }
    
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
  }
  
  try {
    // Look up AUTH session in MongoDB (only authentication sessions)
    const session = await getAuthSessionFromStore(sessionId);
    
    // Reject if not a valid auth session
    if (!session) {
      console.log('Invalid auth session, clearing cookie...');
      
      // Clear the invalid auth cookie
      res.clearCookie(AUTH_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session',
        message: 'Your session has expired. Please log in again.'
      });
    }
    
    // Check if session is still active (within timeout window)
    if (!session.isSessionActive()) {
      console.log('Session expired due to inactivity:', {
        sessionId: session.sessionId,
        lastActivity: session.endTime,
        now: new Date()
      });
      
      // Mark session as inactive
      session.isActive = false;
      await session.save();
      
      // Clear the expired auth cookie
      res.clearCookie(AUTH_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Session expired due to inactivity',
        message: 'Please log in again to continue'
      });
    }
    
    // Extend session on activity (always for auth sessions)
    console.log('Extending auth session activity...');
    await session.extendSession();
    
    // Get user from session data
    req.user = await User.findById(session.userId);
    
    if (!req.user) {
      console.log('User not found for session:', {
        sessionId: session.sessionId,
        userId: session.userId
      });
      
      // Mark session as inactive since user no longer exists
      session.isActive = false;
      await session.save();
      
      // Clear the invalid auth cookie
      res.clearCookie(AUTH_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      });
      
      return res.status(401).json({
        success: false,
        error: 'User account not found',
        message: 'Your account may have been deleted'
      });
    }
    
    // Check if user is active
    if (!req.user.isActive) {
      console.log('User account is deactivated:', req.user.email);
      
      // Mark session as inactive
      session.isActive = false;
      await session.save();
      
      // Clear the auth cookie
      res.clearCookie(AUTH_COOKIE_NAME, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      });
      
      return res.status(401).json({
        success: false,
        error: 'Account deactivated',
        message: 'Your account has been deactivated'
      });
    }
    
    // Attach session to request
    req.session = session;
    req.sessionType = 'authentication';
    
    console.log('Auth middleware successful:', {
      userId: req.user._id,
      email: req.user.email,
      role: req.user.role,
      sessionId: session.sessionId,
      sessionType: session.sessionType,
      device: session.deviceType,
      browser: session.browser
    });
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    // Clear cookie on error for security
    res.clearCookie(AUTH_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
    });
    
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

// Optional: Middleware to check for any session (tracking or auth) - for analytics
exports.anySessionMiddleware = async (req, res, next) => {
  console.log('AnySession middleware checking for any session...');
  
  // Check for auth session first
  const authSessionId = req.cookies && req.cookies[AUTH_COOKIE_NAME];
  const trackingSessionId = req.cookies && req.cookies[TRACKING_COOKIE_NAME];
  
  let session = null;
  
  if (authSessionId) {
    // Try to get auth session
    session = await Session.findOne({
      sessionId: authSessionId,
      isActive: true,
      sessionType: 'authentication'
    });
    
    if (session && session.isSessionActive()) {
      req.session = session;
      req.sessionType = 'authentication';
      
      // Get user if it's an auth session
      if (session.userId) {
        req.user = await User.findById(session.userId);
      }
      
      // Extend session
      await session.extendSession();
      
      console.log('AnySession: Found auth session');
      return next();
    }
  }
  
  if (trackingSessionId && !session) {
    // Try to get tracking session
    session = await Session.findOne({
      sessionId: trackingSessionId,
      isActive: true,
      sessionType: 'tracking'
    });
    
    if (session && session.isSessionActive()) {
      req.session = session;
      req.sessionType = 'tracking';
      
      // Extend tracking session
      await session.extendSession();
      
      console.log('AnySession: Found tracking session');
      return next();
    }
  }
  
  // No valid session found, but we still allow the request to proceed
  // This is useful for public routes that still want to track if session exists
  console.log('AnySession: No valid session found');
  next();
};

// Admin middleware - relies on req.user set by authMiddleware
exports.adminMiddleware = (req, res, next) => {
  console.log('Admin middleware check:', {
    userId: req.user?._id,
    userRole: req.user?.role,
    userEmail: req.user?.email,
    hasUser: !!req.user,
    isAdmin: req.user?.role === 'admin',
    sessionType: req.sessionType
  });
    
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    console.log('Admin access denied for user:', {
      userId: req.user?._id,
      email: req.user?.email,
      role: req.user?.role
    });
    
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
      message: 'You do not have permission to access this resource'
    });
  }
};

// Author middleware - allows admin, author, or editor roles
exports.authorMiddleware = (req, res, next) => {
  console.log('Author middleware check:', {
    userId: req.user?._id,
    userRole: req.user?.role,
    sessionType: req.sessionType
  });
  
  const allowedRoles = ['admin', 'author', 'editor'];
  
  if (req.user && allowedRoles.includes(req.user.role)) {
    next();
  } else {
    console.log('Author access denied for user:', req.user?.role);
    
    return res.status(403).json({
      success: false,
      error: 'Author access required',
      message: 'You do not have permission to access this resource'
    });
  }
};

// Optional: Middleware to attach user if exists (for optional auth routes)
exports.optionalAuthMiddleware = async (req, res, next) => {
  console.log('Optional auth middleware checking...');
  
  // Check for auth session
  const sessionId = req.cookies && req.cookies[AUTH_COOKIE_NAME];
  
  if (!sessionId) {
    console.log('Optional auth: No session cookie found');
    return next(); // Continue without auth
  }
  
  try {
    const session = await getAuthSessionFromStore(sessionId);
    
    if (!session || !session.isSessionActive()) {
      console.log('Optional auth: No valid auth session');
      return next(); // Continue without auth
    }
    
    // Extend session
    await session.extendSession();
    
    // Get user
    req.user = await User.findById(session.userId);
    req.session = session;
    req.sessionType = 'authentication';
    
    if (!req.user || !req.user.isActive) {
      console.log('Optional auth: User not found or inactive');
      // Don't attach user, but continue
      delete req.user;
      delete req.session;
      return next();
    }
    
    console.log('Optional auth: User authenticated:', req.user.email);
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Continue without auth on error
    next();
  }
};

// Helper function to validate session for socket.io or other real-time connections
exports.validateSessionForSocket = async (sessionId) => {
  try {
    if (!sessionId) return null;
    
    const session = await Session.findOne({
      sessionId,
      isActive: true,
      sessionType: 'authentication',
      isAuthenticated: true
    });
    
    if (!session || !session.isSessionActive()) {
      return null;
    }
    
    // Extend session
    await session.extendSession();
    
    // Get user
    const user = await User.findById(session.userId);
    
    if (!user || !user.isActive) {
      return null;
    }
    
    return {
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        username: user.username
      },
      session: {
        id: session.sessionId,
        type: session.sessionType
      }
    };
  } catch (error) {
    console.error('Socket session validation error:', error);
    return null;
  }
};

// Session cleanup middleware (optional, can run as cron job)
exports.cleanupExpiredSessions = async () => {
  try {
    const cutoffTime = new Date(Date.now() - SESSION_CONFIG.inactivityTimeout);
    
    const result = await Session.updateMany(
      {
        isActive: true,
        endTime: { $lt: cutoffTime }
      },
      {
        isActive: false,
        duration: { $round: [{ $subtract: ['$endTime', '$startTime'] }, 1000] }
      }
    );
    
    console.log(`Cleaned up ${result.modifiedCount} expired sessions`);
    return result.modifiedCount;
  } catch (error) {
    console.error('Session cleanup error:', error);
    return 0;
  }
};

// Export cookie names for use in other parts of the app
exports.COOKIE_NAMES = {
  AUTH: AUTH_COOKIE_NAME,
  TRACKING: TRACKING_COOKIE_NAME
};
