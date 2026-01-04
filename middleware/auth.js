const jwt = require('jsonwebtoken');  
const User = require('../models/User');  
const Session = require('../models/Session');  
  
// Session store lookup using MongoDB Session model  
const getSessionFromStore = async (sessionId) => {  
  try {  
    const session = await Session.findOne({   
      sessionId,   
      isActive: true   
    });  
      
    console.log('Looking up session:', sessionId);  
    return session;  
  } catch (error) {  
    console.error('Session lookup error:', error);  
    return null;  
  }  
};  
  
exports.authMiddleware = async (req, res, next) => {  
  // Check for session_id cookie  
  const sessionId = req.cookies && req.cookies.session_id;  
    
  // If no session found  
  if (!sessionId) {  
    return res.status(401).json({  
      success: false,  
      error: 'Not authorized to access this route'  
    });  
  }  
    
  try {  
    // Look up session in MongoDB  
    const session = await getSessionFromStore(sessionId);  
      
    if (!session || !session.userId) {  
      return res.status(401).json({  
        success: false,  
        error: 'Invalid or expired session'  
      });  
    }  
      
    // Check if session is still active (within timeout window)  
    if (!session.isSessionActive()) {  
      return res.status(401).json({  
        success: false,  
        error: 'Session expired due to inactivity'  
      });  
    }  
      
    // Extend session on activity if configured  
    if (session.extendOnActivity !== false) {  
      await session.extendSession();  
    }  
      
    // Get user from session data  
    req.user = await User.findById(session.userId);  
      
    if (!req.user) {  
      return res.status(401).json({  
        success: false,  
        error: 'User not found'  
      });  
    }  
      
    // Attach session to request for analytics tracking  
    req.session = session;  
      
    next();  
  } catch (error) {  
    console.error('Auth middleware error:', error);  
    return res.status(401).json({  
      success: false,  
      error: 'Not authorized to access this route'  
    });  
  }  
};  
  
// Admin middleware - relies on req.user set above  
exports.adminMiddleware = (req, res, next) => {  
  console.log('Admin middleware check:', {  
    userId: req.user?._id,  
    userRole: req.user?.role,  
    userEmail: req.user?.email,  
    hasUser: !!req.user,  
    isAdmin: req.user?.role === 'admin'  
  });  
    
  if (req.user && req.user.role === 'admin') {  
    next();  
  } else {  
    console.log('Admin access denied for user:', req.user);  
    return res.status(403).json({  
      success: false,  
      error: 'Admin access required'  
    });  
  }  
};  
  
// Author middleware - allows admin, author, or editor roles  
exports.authorMiddleware = (req, res, next) => {  
  if (req.user && (req.user.role === 'admin' || req.user.role === 'author' || req.user.role === 'editor')) {  
    next();  
  } else {  
    return res.status(403).json({  
      success: false,  
      error: 'Author access required'  
    });  
  }  
};
