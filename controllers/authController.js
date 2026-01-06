// controllers/authController.js  
const User = require('../models/User');  
const { Session, SESSION_CONFIG } = require('../models/Session');  
const { v4: uuidv4 } = require('uuid');  
  
// Helper function to extract device info from user agent  
function extractDeviceInfo(userAgent) {  
  const ua = userAgent || '';  
  const deviceInfo = {  
    deviceType: 'unknown',  
    deviceCategory: 'unknown',  
    browser: 'unknown',  
    browserVersion: '',  
    os: 'unknown',  
    osVersion: '',  
    screenResolution: '',  
    isTouchDevice: false  
  };  
    
  // Device type detection  
  if (ua.match(/mobile/i)) {  
    deviceInfo.deviceType = 'mobile';  
    deviceInfo.deviceCategory = 'smartphone';  
    deviceInfo.isTouchDevice = true;  
  } else if (ua.match(/tablet/i)) {  
    deviceInfo.deviceType = 'tablet';  
    deviceInfo.deviceCategory = 'tablet';  
    deviceInfo.isTouchDevice = true;  
  } else if (ua.match(/tv|smart-tv|appletv|roku|chromecast|fire tv/i)) {  
    deviceInfo.deviceType = 'tv';  
    deviceInfo.deviceCategory = 'tv';  
  } else if (ua.match(/(xbox|playstation|nintendo)/i)) { // FIXED: Added missing parenthesis  
    deviceInfo.deviceType = 'console';  
    deviceInfo.deviceCategory = 'console';  
  } else if (ua.match(/(watch|wearable)/i)) { // FIXED: Added missing parenthesis  
    deviceInfo.deviceType = 'wearable';  
    deviceInfo.deviceCategory = 'wearable';  
  } else {  
    deviceInfo.deviceType = 'desktop';  
    deviceInfo.deviceCategory = 'desktop';  
  }  
    
  // Browser detection  
  const chromeMatch = ua.match(/chrome\/(\d+)/i);  
  const firefoxMatch = ua.match(/firefox\/(\d+)/i);  
  const safariMatch = ua.match(/version\/(\d+).*safari/i);  
  const edgeMatch = ua.match(/edg\/(\d+)/i);  
    
  if (chromeMatch) {  
    deviceInfo.browser = 'Chrome';  
    deviceInfo.browserVersion = chromeMatch[1];  
  } else if (firefoxMatch) {  
    deviceInfo.browser = 'Firefox';  
    deviceInfo.browserVersion = firefoxMatch[1];  
  } else if (safariMatch) {  
    deviceInfo.browser = 'Safari';  
    deviceInfo.browserVersion = safariMatch[1];  
  } else if (edgeMatch) {  
    deviceInfo.browser = 'Edge';  
    deviceInfo.browserVersion = edgeMatch[1];  
  } else if (ua.match(/opera|opr/i)) {  
    deviceInfo.browser = 'Opera';  
  }  
    
  // OS detection  
  if (ua.match(/windows nt 10/i)) {  
    deviceInfo.os = 'Windows';  
    deviceInfo.osVersion = '10';  
  } else if (ua.match(/windows nt 6.3/i)) {  
    deviceInfo.os = 'Windows';  
    deviceInfo.osVersion = '8.1';  
  } else if (ua.match(/windows nt 6.2/i)) {  
    deviceInfo.os = 'Windows';  
    deviceInfo.osVersion = '8';  
  } else if (ua.match(/windows nt 6.1/i)) {  
    deviceInfo.os = 'Windows';  
    deviceInfo.osVersion = '7';  
  } else if (ua.match(/mac os x (\d+[._]\d+)/i)) {  
    deviceInfo.os = 'macOS';  
    deviceInfo.osVersion = ua.match(/mac os x (\d+[._]\d+)/i)[1].replace('_', '.');  
  } else if (ua.match(/linux/i)) {  
    deviceInfo.os = 'Linux';  
  } else if (ua.match(/android (\d+)/i)) {  
    deviceInfo.os = 'Android';  
    deviceInfo.osVersion = ua.match(/android (\d+)/i)[1];  
  } else if (ua.match(/iphone os (\d+)/i) || ua.match(/ipad;.*os (\d+)/i)) {  
    deviceInfo.os = 'iOS';  
    deviceInfo.osVersion = (ua.match(/iphone os (\d+)/i) || ua.match(/ipad;.*os (\d+)/i))[1];  
  }  
    
  return deviceInfo;  
}  
  
// Helper function to determine traffic source  
function determineSource(req) {  
  const referrer = req.get('referer') || req.headers.referer;  
    
  if (!referrer) return 'direct';  
    
  if (referrer.includes('google.com')) return 'google';  
  if (referrer.includes('facebook.com') ||   
      referrer.includes('twitter.com') ||   
      referrer.includes('linkedin.com') ||  
      referrer.includes('instagram.com')) return 'social';  
  if (referrer.includes('mail.') || referrer.includes('email') || referrer.includes('newsletter')) return 'email';  
    
  return 'referral';  
}  
  
// User login - Updated with unified session model  
async login(req, res) {  
  try {  
    const { email, password } = req.body;  
      
    console.log('Login attempt for:', email);  
      
    // Find user by email  
    const user = await User.findOne({ email });  
    if (!user) {  
      console.log('User not found:', email);  
      return res.status(401).json({  
        success: false,  
        error: 'Invalid credentials'  
      });  
    }  
      
    // Check if user is active  
    if (!user.isActive) {  
      return res.status(401).json({  
        success: false,  
        error: 'Account is deactivated'  
      });  
    }  
      
    // Verify password  
    console.log('Verifying password...');  
    const isPasswordValid = await user.comparePassword(password);  
    if (!isPasswordValid) {  
      console.log('Invalid password for user:', email);  
      return res.status(401).json({  
        success: false,  
        error: 'Invalid credentials'  
      });  
    }  
      
    console.log('Password valid, creating/updating session...');  
      
    // Check if user already has active auth session (prevent multiple sessions)  
    const existingAuthSession = await Session.findOne({  
      userId: user._id,  
      sessionType: 'authentication',  
      isActive: true,  
      endTime: { $gte: new Date(Date.now() - SESSION_CONFIG.inactivityTimeout) }  
    }).sort({ endTime: -1 });  
      
    let sessionId;  
    let session;  
    let isConvertedFromTracking = false;  
      
    // Check if there's a tracking session to convert  
    const trackingCookie = req.cookies[SESSION_CONFIG.COOKIE_NAMES?.TRACKING || 'tracking_session_id'];  
    let trackingSession = null;  
      
    if (trackingCookie) {  
      trackingSession = await Session.findOne({  
        sessionId: trackingCookie,  
        sessionType: 'tracking',  
        isAuthenticated: false  
      });  
        
      if (trackingSession) {  
        console.log('Found tracking session to convert:', trackingCookie);  
      }  
    }  
      
    if (trackingSession) {  
      // CONVERT TRACKING SESSION TO AUTH SESSION  
      console.log('Converting tracking session to auth session...');  
        
      sessionId = trackingSession.sessionId;  
      isConvertedFromTracking = true;  
        
      // Update tracking session to become auth session  
      trackingSession.userId = user._id;  
      trackingSession.sessionType = 'authentication';  
      trackingSession.isAuthenticated = true;  
      trackingSession.convertedAt = new Date();  
      trackingSession.endTime = new Date();  
      trackingSession.pageCount += 1;  
        
      await trackingSession.save();  
      session = trackingSession;  
        
      // Clear the tracking cookie (now using auth cookie)  
      res.clearCookie(SESSION_CONFIG.COOKIE_NAMES?.TRACKING || 'tracking_session_id', {  
        path: '/',  
        httpOnly: true,  
        secure: process.env.NODE_ENV === 'production',  
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'  
      });  
        
      console.log('Successfully converted tracking session to auth session');  
        
    } else if (existingAuthSession) {  
      // REUSE EXISTING AUTH SESSION  
      console.log('Reusing existing auth session...');  
        
      sessionId = existingAuthSession.sessionId;  
      existingAuthSession.endTime = new Date();  
      existingAuthSession.pageCount += 1;  
        
      await existingAuthSession.save();  
      session = existingAuthSession;  
        
      console.log('Reused existing auth session');  
        
    } else {  
      // CREATE NEW AUTH SESSION  
      console.log('Creating new auth session...');  
        
      // Generate unique session ID  
      sessionId = `sess_auth_${uuidv4()}_${Date.now()}`;  
        
      // Get device info from request  
      const userAgent = req.headers['user-agent'];  
      const deviceInfo = extractDeviceInfo(userAgent);  
        
      // Determine traffic source  
      const source = determineSource(req);  
      const referrer = req.get('referer') || req.headers.referer || 'direct';  
        
      // Create new auth session  
      session = new Session({  
        sessionId,  
        userId: user._id,  
        sessionType: 'authentication',  
        isAuthenticated: true,  
        ipAddress: req.ip,  
        userAgent: userAgent,  
        deviceType: deviceInfo.deviceType,  
        deviceCategory: deviceInfo.deviceCategory,  
        browser: deviceInfo.browser,  
        browserVersion: deviceInfo.browserVersion,  
        os: deviceInfo.os,  
        osVersion: deviceInfo.osVersion,  
        isTouchDevice: deviceInfo.isTouchDevice,  
        referrer: referrer,  
        source: source,  
        startTime: new Date(),  
        endTime: new Date(),  
        pageCount: 1,  
        isActive: true,  
        convertedAt: null // Not a conversion, fresh auth session  
      });  
        
      await session.save();  
      console.log('Created new auth session');  
    }  
      
    // Set the auth cookie (shorter expiration for security)  
    const authCookieMaxAge = 2 * 60 * 60 * 1000; // 2 hours for auth sessions  
      
    res.cookie(SESSION_CONFIG.COOKIE_NAMES?.AUTH || 'session_id', sessionId, {  
      httpOnly: true,  
      secure: process.env.NODE_ENV === 'production',  
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',  
      maxAge: authCookieMaxAge,  
      path: '/'  
    });  
      
    console.log('Auth cookie set with 2-hour expiration');  
      
    // Return user info without password  
    const userResponse = user.toJSON ? user.toJSON() : {  
      id: user._id,  
      username: user.username,  
      email: user.email,  
      role: user.role,  
      avatar: user.avatar,  
      bio: user.bio,  
      isActive: user.isActive,  
      createdAt: user.createdAt,  
      updatedAt: user.updatedAt  
    };  
      
    // Remove sensitive data  
    delete userResponse.password;  
    delete userResponse.resetPasswordToken;  
    delete userResponse.resetPasswordExpires;  
      
    // Prepare response with session info  
    const response = {  
      success: true,  
      data: {  
        user: userResponse,  
        session: {  
          id: session.sessionId,  
          type: session.sessionType,  
          converted: isConvertedFromTracking,  
          expiresIn: '2 hours',  
          device: session.deviceType,  
          browser: session.browser  
        }  
      }  
    };  
      
    // If session was converted from tracking, include timestamp  
    if (session.convertedAt) {  
      response.data.session.convertedAt = session.convertedAt;  
    }  
      
    res.json(response);  
      
  } catch (error) {  
    console.error('Login error details:', error);  
    res.status(500).json({  
      success: false,  
      error: 'Failed to login: ' + error.message  
    });  
  }  
}  
  
// User logout  
async logout(req, res) {  
  try {  
    const sessionId = req.cookies[SESSION_CONFIG.COOKIE_NAMES?.AUTH || 'session_id'];  
      
    if (sessionId) {  
      // Mark auth session as inactive  
      const authSession = await Session.findOne({   
        sessionId,   
        sessionType: 'authentication'   
      });  
        
      if (authSession) {  
        authSession.isActive = false;  
        authSession.endTime = new Date();  
        authSession.duration = Math.round((authSession.endTime - authSession.startTime) / 1000);  
        await authSession.save();  
        console.log('Auth session terminated:', sessionId);  
      }  
        
      // Clear auth cookie  
      res.clearCookie(SESSION_CONFIG.COOKIE_NAMES?.AUTH || 'session_id', {  
        path: '/',  
        httpOnly: true,  
        secure: process.env.NODE_ENV === 'production',  
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'  
      });  
        
      console.log('Auth cookie cleared');  
    }  
      
    // Create new tracking session for anonymous browsing  
    const newTrackingSessionId = `sess_track_${uuidv4()}_${Date.now()}`;  
      
    const userAgent = req.headers['user-agent'];  
    const deviceInfo = extractDeviceInfo(userAgent);  
    const source = determineSource(req);  
    const referrer = req.get('referer') || req.headers.referer || 'direct';  
      
    const trackingSession = new Session({  
      sessionId: newTrackingSessionId,  
      sessionType: 'tracking',  
      isAuthenticated: false,  
      userId: null,  
      ipAddress: req.ip,  
      userAgent: userAgent,  
      deviceType: deviceInfo.deviceType,  
      deviceCategory: deviceInfo.deviceCategory,  
      browser: deviceInfo.browser,  
      browserVersion: deviceInfo.browserVersion,  
      os: deviceInfo.os,  
      osVersion: deviceInfo.osVersion,  
      isTouchDevice: deviceInfo.isTouchDevice,  
      referrer: referrer,  
      source: source,  
      startTime: new Date(),  
      endTime: new Date(),  
      pageCount: 1,  
      isActive: true  
    });  
      
    await trackingSession.save();  
      
    // Set tracking cookie (longer expiration for tracking)  
    res.cookie(SESSION_CONFIG.COOKIE_NAMES?.TRACKING || 'tracking_session_id', newTrackingSessionId, {  
      httpOnly: true,  
      secure: process.env.NODE_ENV === 'production',  
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',  
      maxAge: SESSION_CONFIG.cookieExpiration,  
      path: '/'  
    });  
      
    res.json({  
      success: true,  
      message: 'Logged out successfully',  
      data: {  
        session: {  
          id: newTrackingSessionId,  
          type: 'tracking'  
        }  
      }  
    });  
      
  } catch (error) {  
    console.error('Logout error details:', error);  
    res.status(500).json({  
      success: false,  
      error: 'Failed to logout: ' + error.message  
    });  
  }  
}  
  
// Get current session info  
async getSessionInfo(req, res) {  
  try {  
    const sessionId = req.cookies[SESSION_CONFIG.COOKIE_NAMES?.AUTH || 'session_id'];  
      
    if (!sessionId) {  
      return res.json({  
        success: true,  
        data: {  
          isAuthenticated: false,  
          sessionType: 'none'  
        }  
      });  
    }  
      
    const session = await Session.findOne({   
      sessionId,  
      isActive: true   
    });  
      
    if (!session) {  
      // Clear invalid session cookie  
      res.clearCookie(SESSION_CONFIG.COOKIE_NAMES?.AUTH || 'session_id');  
        
      return res.json({  
        success: true,  
        data: {  
          isAuthenticated: false,  
          sessionType: 'none'  
        }  
      });  
    }  
      
    // Check if session is still active  
    if (!session.isSessionActive()) {  
      session.isActive = false;  
      await session.save();  
      res.clearCookie(SESSION_CONFIG.COOKIE_NAMES?.AUTH || 'session_id');  
        
      return res.json({  
        success: true,  
        data: {  
          isAuthenticated: false,  
          sessionType: 'expired'  
        }  
      });  
    }  
      
    // Update session activity  
    await session.extendSession();  
      
    const response = {  
      success: true,  
      data: {  
        isAuthenticated: session.isAuthenticated,  
        sessionType: session.sessionType,  
        sessionId: session.sessionId,  
        userId: session.userId,  
        device: session.deviceType,  
        browser: session.browser,  
        pagesViewed: session.pageCount,  
        duration: session.duration,  
        isActive: session.isActive,  
        startTime: session.startTime,  
        lastActivity: session.endTime  
      }  
    };  
      
    // Add user info if authenticated  
    if (session.isAuthenticated && session.userId) {  
      const user = await User.findById(session.userId).select('-password');  
      if (user) {  
        response.data.user = {  
          id: user._id,  
          username: user.username,  
          email: user.email,  
          role: user.role,  
          avatar: user.avatar,  
          bio: user.bio  
        };  
      }  
    }  
      
    res.json(response);  
      
  } catch (error) {  
    console.error('Get session info error:', error);  
    res.status(500).json({  
      success: false,  
      error: 'Failed to get session info'  
    });  
  }  
}  
  
module.exports = {  
  login,  
  logout,  
  getSessionInfo  
};
