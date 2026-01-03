const jwt = require('jsonwebtoken');  
const User = require('../models/User');  
  
// Session store - you'll need to implement this based on your setup  
// This could be Redis, MongoDB, or in-memory store  
const getSessionFromStore = async (sessionId) => {  
  // Example implementation - adjust based on your session storage  
  try {     
     const Session = require('../models/Session');  
     return await Session.findOne({ sessionId });  
      
    // For now, return null - you need to implement your session store lookup  
    console.log('Looking up session:', sessionId);  
    return null;  
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
    // Look up session in session store (NOT verify as JWT)  
    const session = await getSessionFromStore(sessionId);  
      
    if (!session || !session.userId) {  
      return res.status(401).json({  
        success: false,  
        error: 'Invalid or expired session'  
      });  
    }  
      
    // Get user from session data  
    req.user = await User.findById(session.userId);  
      
    if (!req.user) {  
      return res.status(401).json({  
        success: false,  
        error: 'User not found'  
      });  
    }  
      
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
