const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.authMiddleware = async (req, res, next) => {
  let token;

  // 1. Check for token in cookies (Primary method for HTTP-only)
  if (req.cookies && req.cookies.authToken) {
    token = req.cookies.authToken;
  }
  // 2. Fallback: Check Authorization header (Bearer token)
  // This is useful for tools like Postman or mobile apps
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // If no token found
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
};

// Admin middleware usually doesn't need changes as it relies on req.user set above
exports.adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
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
