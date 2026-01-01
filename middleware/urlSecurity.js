const { URLEncryption } = require('../utils/urlObfuscation');

/**
 * URL Security Middleware
 * Provides security features for URL-based operations
 */

/**
 * Middleware to validate secure URL tokens
 * Checks if the request contains valid encrypted parameters
 */
const validateSecureToken = (req, res, next) => {
  try {
    // Extract token from URL parameters or query string
    const token = req.params.token || req.query.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Security token required'
      });
    }

    // Decrypt and validate the token
    const decryptedData = URLEncryption.decrypt(token);

    // Check if token has expired (5 minute default)
    if (decryptedData.timestamp) {
      const tokenAge = Date.now() - decryptedData.timestamp;
      const maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (tokenAge > maxAge) {
        return res.status(401).json({
          success: false,
          error: 'Security token has expired'
        });
      }
    }

    // Attach decrypted data to request for use in route handlers
    req.secureData = decryptedData;
    next();

  } catch (error) {
    console.error('URL Security validation error:', error);
    return res.status(400).json({
      success: false,
      error: 'Invalid security token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware to extract and validate secure parameters from request
 * Used for routes that accept encrypted parameters
 */
const extractSecureParams = (req, res, next) => {
  try {
    // Try to extract from different sources
    let token = null;

    // Check URL parameters first
    if (req.params.token) {
      token = req.params.token;
    }
    // Check query parameters
    else if (req.query.token) {
      token = req.query.token;
    }
    // Check body for POST requests
    else if (req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Security token required'
      });
    }

    // Decrypt the token
    const secureParams = URLEncryption.decrypt(token);

    // Validate timestamp if present
    if (secureParams.timestamp) {
      const tokenAge = Date.now() - secureParams.timestamp;
      const maxAge = 5 * 60 * 1000; // 5 minutes

      if (tokenAge > maxAge) {
        return res.status(401).json({
          success: false,
          error: 'Security token has expired'
        });
      }
    }

    // Attach secure parameters to request
    req.secureParams = secureParams;
    next();

  } catch (error) {
    console.error('Secure parameter extraction error:', error);
    return res.status(400).json({
      success: false,
      error: 'Invalid or corrupted security token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware to generate secure URLs for admin operations
 * Adds secure token generation capability to responses
 */
const generateSecureToken = (req, res, next) => {
  // Add helper function to response for generating secure tokens
  res.generateSecureToken = (params) => {
    const secureParams = {
      ...params,
      timestamp: Date.now(),
      userId: req.user ? req.user._id : null,
      ip: req.ip || req.connection.remoteAddress
    };

    return URLEncryption.encrypt(secureParams);
  };

  next();
};

/**
 * Middleware to log security events
 * Logs access to secure URLs for audit purposes
 */
const logSecurityEvent = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const url = req.originalUrl;

  console.log(`🔒 [${timestamp}] Security Access: ${ip} - ${url} - ${userAgent}`);

  // Log additional details for secure routes
  if (req.secureParams || req.secureData) {
    const secureData = req.secureParams || req.secureData;
    console.log(`🔒 Secure Params: ${JSON.stringify(secureData)}`);
  }

  next();
};

/**
 * Combined security middleware for admin routes
 * Applies all security checks in the correct order
 */
const secureAdminMiddleware = [
  logSecurityEvent,
  generateSecureToken,
  validateSecureToken
];

/**
 * Combined security middleware for parameter extraction
 * Applies validation and parameter extraction
 */
const secureParamsMiddleware = [
  logSecurityEvent,
  extractSecureParams
];

module.exports = {
  validateSecureToken,
  extractSecureParams,
  generateSecureToken,
  logSecurityEvent,
  secureAdminMiddleware,
  secureParamsMiddleware
};
