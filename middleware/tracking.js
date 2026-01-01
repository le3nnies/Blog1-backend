// middleware/tracking.js
const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const PageView = require('../models/PageView');
const Session = require('../models/Session');
const Event = require('../models/Event');
const Article = require('../models/Article');

// Session configuration constants
const SESSION_CONFIG = {
  inactivityTimeout: 30 * 60 * 1000, // 30 minutes of inactivity
  maxSessionDuration: 4 * 60 * 60 * 1000, // 4 hours absolute maximum
  cookieExpiration: 30 * 24 * 60 * 60 * 1000, // 30 days
  extendOnActivity: true // Extend session on any interaction
};

// Continent mapping configuration
const CONTINENT_MAP = {
  'US': 'North America', 'CA': 'North America', 'MX': 'North America',
  'GB': 'Europe', 'DE': 'Europe', 'FR': 'Europe', 'IT': 'Europe', 'ES': 'Europe',
  'RU': 'Europe', 'PL': 'Europe', 'NL': 'Europe', 'BE': 'Europe', 'CH': 'Europe',
  'AT': 'Europe', 'SE': 'Europe', 'NO': 'Europe', 'DK': 'Europe', 'FI': 'Europe',
  'CN': 'Asia', 'JP': 'Asia', 'KR': 'Asia', 'IN': 'Asia', 'SG': 'Asia',
  'HK': 'Asia', 'TW': 'Asia', 'TH': 'Asia', 'MY': 'Asia', 'ID': 'Asia',
  'PH': 'Asia', 'VN': 'Asia', 'PK': 'Asia', 'BD': 'Asia', 'LK': 'Asia',
  'AU': 'Oceania', 'NZ': 'Oceania',
  'BR': 'South America', 'AR': 'South America', 'CL': 'South America',
  'CO': 'South America', 'PE': 'South America', 'VE': 'South America',
  'ZA': 'Africa', 'NG': 'Africa', 'EG': 'Africa', 'KE': 'Africa', 'MA': 'Africa',
  'TN': 'Africa', 'GH': 'Africa', 'ET': 'Africa', 'TZ': 'Africa', 'UG': 'Africa'
};

// Generate session ID
const generateSessionId = (req) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const timestamp = Date.now().toString();
  
  const hash = crypto
    .createHash('md5')
    .update(`${ip}-${userAgent}-${timestamp}`)
    .digest('hex');
    
  return `sess_${hash}_${Date.now()}`;
};

// Parse user agent
const parseUserAgent = (userAgent) => {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    browser: result.browser.name || 'Unknown',
    browserVersion: result.browser.version || 'Unknown',
    os: result.os.name || 'Unknown',
    osVersion: result.os.version || 'Unknown',
    deviceType: getDeviceType(result.device),
    deviceCategory: getDeviceCategory(result.device, result.os),
    deviceBrand: result.device.vendor || 'Unknown',
    deviceModel: result.device.model || 'Unknown',
    isTouchDevice: isTouchDevice(result.device, userAgent)
  };
};

// Determine device type
const getDeviceType = (device) => {
  if (device.type === 'mobile') return 'mobile';
  if (device.type === 'tablet') return 'tablet';
  if (device.model && device.model.toLowerCase().includes('tv')) return 'tv';
  if (device.type === 'console') return 'console';
  return 'desktop';
};

// Determine device category (more granular than device type)
const getDeviceCategory = (device, os) => {
  // Smartphones
  if (device.type === 'mobile') {
    if (os.name === 'iOS' || os.name === 'iPadOS') return 'smartphone';
    if (os.name === 'Android') return 'smartphone';
    return 'feature-phone';
  }

  // Tablets
  if (device.type === 'tablet') return 'tablet';

  // TVs and consoles
  if (device.model && device.model.toLowerCase().includes('tv')) return 'tv';
  if (device.type === 'console') return 'console';

  // Wearables
  if (device.type === 'wearable') return 'wearable';

  // Desktop/laptop devices (when device.type is undefined or empty)
  // This covers most desktop browsers that don't specify a device type
  if (device.type === undefined || device.type === '' || device.type === null) {
    // Check if it's a mobile/tablet user agent that somehow wasn't caught above
    const osName = os.name?.toLowerCase() || '';
    const userAgentCheck = osName.includes('android') || osName.includes('ios') || osName.includes('ipad');

    if (userAgentCheck) {
      return 'smartphone'; // fallback for mobile devices
    }

    // Default to desktop for all other cases (browsers, etc.)
    return 'desktop';
  }

  // Any other device types
  return 'desktop'; // fallback for any unrecognized device type
};

// Determine if device is touch-enabled
const isTouchDevice = (device, userAgent) => {
  // Check device type
  if (device.type === 'mobile' || device.type === 'tablet') return true;

  // Check user agent for touch indicators
  const ua = userAgent.toLowerCase();
  if (ua.includes('touch') || ua.includes('mobile') || ua.includes('tablet')) return true;

  // Check for specific touch device patterns
  if (ua.includes('ipad') || ua.includes('iphone') || ua.includes('android')) return true;

  return false;
};

// Get location from IP
const getLocationFromIP = (ip) => {
  // Handle localhost and private IPs
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return {
      country: 'Local',
      city: 'Local',
      region: 'Local',
      latitude: null,
      longitude: null
    };
  }
  
  const geo = geoip.lookup(ip);
  if (!geo) {
    return {
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown',
      latitude: null,
      longitude: null
    };
  }
  
  return {
    country: geo.country || 'Unknown',
    city: geo.city || 'Unknown',
    region: geo.region || 'Unknown',
    latitude: geo.ll ? geo.ll[0] : null,
    longitude: geo.ll ? geo.ll[1] : null
  };
};

// Extract UTM parameters from URL
const extractUTMParameters = (url) => {
  try {
    const urlObj = new URL(url, 'http://localhost'); // base URL for relative URLs
    const params = new URLSearchParams(urlObj.search);
    
    return {
      source: params.get('utm_source') || null,
      medium: params.get('utm_medium') || null,
      campaign: params.get('utm_campaign') || null,
      content: params.get('utm_content') || null,
      term: params.get('utm_term') || null,
      gclid: params.get('gclid') || null,
      fbclid: params.get('fbclid') || null
    };
  } catch (error) {
    return {
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      gclid: null,
      fbclid: null
    };
  }
};

// Enhanced traffic source detection with comprehensive categorization
const determineSource = (referrer, utmSource, utmMedium, userAgent) => {
  // If UTM source is provided, prioritize it (paid/organic attribution)
  if (utmSource) {
    const source = utmSource.toLowerCase();

    // Handle common UTM source variations
    if (source.includes('google') || source.includes('cpc') || source.includes('ppc')) return 'google';
    if (source.includes('facebook') || source.includes('fb') || source.includes('meta')) return 'facebook';
    if (source.includes('twitter') || source.includes('tweet')) return 'twitter';
    if (source.includes('linkedin') || source.includes('li')) return 'linkedin';
    if (source.includes('instagram') || source.includes('ig')) return 'instagram';
    if (source.includes('tiktok') || source.includes('tt')) return 'tiktok';
    if (source.includes('pinterest') || source.includes('pin')) return 'pinterest';
    if (source.includes('youtube') || source.includes('yt')) return 'youtube';
    if (source.includes('reddit')) return 'reddit';
    if (source.includes('bing')) return 'bing';
    if (source.includes('yahoo')) return 'yahoo';
    if (source.includes('duckduckgo') || source.includes('ddg')) return 'duckduckgo';

    // Email marketing sources
    if (source.includes('mailchimp') || source.includes('mail')) return 'email';
    if (source.includes('newsletter') || source.includes('email')) return 'email';

    // Return the cleaned UTM source
    return source.replace(/[^a-z0-9_-]/g, '').substring(0, 50);
  }

  // If no referrer, it's direct traffic
  if (!referrer || referrer === 'direct' || referrer === '') {
    return 'direct';
  }

  try {
    const referrerUrl = new URL(referrer);
    const hostname = referrerUrl.hostname.toLowerCase();
    const pathname = referrerUrl.pathname.toLowerCase();
    const searchParams = referrerUrl.searchParams;

    // Search Engines (Organic)
    if (hostname.includes('google.')) {
      // Check if it's a paid search result
      if (searchParams.has('gclid') || utmMedium === 'cpc' || utmMedium === 'ppc') {
        return 'google';
      }
      return 'google';
    }

    if (hostname.includes('bing.')) {
      if (searchParams.has('msclkid') || utmMedium === 'cpc') {
        return 'bing';
      }
      return 'bing';
    }

    if (hostname.includes('yahoo.')) {
      if (utmMedium === 'cpc') return 'yahoo';
      return 'yahoo';
    }

    if (hostname.includes('duckduckgo.')) return 'duckduckgo';
    if (hostname.includes('baidu.')) return 'baidu';
    if (hostname.includes('yandex.')) return 'yandex';
    if (hostname.includes('naver.')) return 'naver';
    if (hostname.includes('seznam.')) return 'seznam';
    if (hostname.includes('qwant.')) return 'qwant';
    if (hostname.includes('ecosia.')) return 'ecosia';
    if (hostname.includes('startpage.')) return 'startpage';

    // Social Media Platforms
    if (hostname.includes('facebook.') || hostname.includes('fb.')) return 'facebook';
    if (hostname.includes('twitter.') || hostname.includes('t.co') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('linkedin.')) return 'linkedin';
    if (hostname.includes('instagram.')) return 'instagram';
    if (hostname.includes('pinterest.')) return 'pinterest';
    if (hostname.includes('reddit.')) return 'reddit';
    if (hostname.includes('tiktok.') || hostname.includes('tiktokv.')) return 'tiktok';
    if (hostname.includes('youtube.') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('snapchat.')) return 'snapchat';
    if (hostname.includes('whatsapp.')) return 'whatsapp';
    if (hostname.includes('telegram.')) return 'telegram';
    if (hostname.includes('discord.')) return 'discord';
    if (hostname.includes('twitch.')) return 'twitch';
    if (hostname.includes('vimeo.')) return 'vimeo';
    if (hostname.includes('dailymotion.')) return 'dailymotion';

    // Email & Newsletter Services
    if (referrerUrl.protocol === 'mailto:') return 'email';
    if (hostname.includes('mail.') || hostname.includes('email')) return 'email';
    if (hostname.includes('gmail.')) return 'email';
    if (hostname.includes('outlook.')) return 'email';
    if (hostname.includes('yahoo.')) return 'email'; // Yahoo Mail
    if (hostname.includes('protonmail.')) return 'email';
    if (hostname.includes('zoho.')) return 'email';

    // Newsletter & Marketing Platforms
    if (hostname.includes('substack.')) return 'email';
    if (hostname.includes('mailchimp.')) return 'email';
    if (hostname.includes('convertkit.')) return 'email';
    if (hostname.includes('klaviyo.')) return 'email';
    if (hostname.includes('activecampaign.')) return 'email';
    if (hostname.includes('sendinblue.')) return 'email';
    if (hostname.includes('constantcontact.')) return 'email';
    if (hostname.includes('getresponse.')) return 'email';

    // Content & Blog Platforms
    if (hostname.includes('medium.')) return 'referral';
    if (hostname.includes('wordpress.')) return 'referral';
    if (hostname.includes('blogspot.')) return 'referral';
    if (hostname.includes('tumblr.')) return 'referral';
    if (hostname.includes('squarespace.')) return 'referral';
    if (hostname.includes('wix.')) return 'referral';

    // News & Media Sites
    if (hostname.includes('news.') || hostname.includes('cnn.') || hostname.includes('bbc.') ||
        hostname.includes('nytimes.') || hostname.includes('washingtonpost.') ||
        hostname.includes('reuters.') || hostname.includes('apnews.')) {
      return 'referral';
    }

    // E-commerce & Shopping
    if (hostname.includes('amazon.') || hostname.includes('ebay.') ||
        hostname.includes('etsy.') || hostname.includes('shopify.')) {
      return 'referral';
    }

    // Mobile Apps (detected via user agent patterns)
    if (userAgent && (
      userAgent.includes('Mobile/') ||
      userAgent.includes('Android') ||
      userAgent.includes('iPhone') ||
      userAgent.includes('iPad')
    )) {
      // Check for app-specific patterns
      if (hostname.includes('apps.apple.com') || hostname.includes('play.google.com')) {
        return 'app_store';
      }
    }

    // Default to referral for any other external referrer
    return 'referral';

  } catch (error) {
    console.warn('Error parsing referrer URL:', error.message);
    return 'direct';
  }
};

// Determine traffic medium based on source and UTM parameters
const determineMedium = (source, utmMedium, referrer) => {
  // If UTM medium is provided, use it
  if (utmMedium) {
    return utmMedium.toLowerCase();
  }

  // Infer medium from source
  const sourceLower = source.toLowerCase();

  // Paid advertising
  if (sourceLower.includes('cpc') || sourceLower.includes('ppc') ||
      sourceLower.includes('paid') || sourceLower.includes('ads')) {
    return 'cpc';
  }

  // Social media
  if (['facebook', 'twitter', 'linkedin', 'instagram', 'pinterest', 'reddit',
       'tiktok', 'youtube', 'snapchat', 'whatsapp', 'telegram', 'discord', 'twitch'].includes(sourceLower)) {
    return 'social';
  }

  // Email marketing
  if (sourceLower === 'email' || sourceLower.includes('mail') || sourceLower.includes('newsletter')) {
    return 'email';
  }

  // Search engines (organic unless specified as paid)
  if (['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex', 'naver'].includes(sourceLower)) {
    return 'organic';
  }

  // Referral
  if (sourceLower === 'referral') {
    return 'referral';
  }

  // Direct
  if (sourceLower === 'direct') {
    return 'none';
  }

  // Default
  return 'referral';
};

// Categorize traffic source for reporting
const categorizeTrafficSource = (source, medium) => {
  const sourceLower = source.toLowerCase();
  const mediumLower = medium.toLowerCase();

  // Paid Traffic
  if (mediumLower === 'cpc' || mediumLower === 'ppc' || mediumLower === 'paid' ||
      sourceLower.includes('ads') || sourceLower.includes('cpc')) {
    return 'paid';
  }

  // Organic Search
  if (mediumLower === 'organic' ||
      ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex', 'naver', 'seznam', 'qwant', 'ecosia', 'startpage'].includes(sourceLower)) {
    return 'organic_search';
  }

  // Social Media
  if (mediumLower === 'social' ||
      ['facebook', 'twitter', 'linkedin', 'instagram', 'pinterest', 'reddit',
       'tiktok', 'youtube', 'snapchat', 'whatsapp', 'telegram', 'discord', 'twitch', 'vimeo'].includes(sourceLower)) {
    return 'social';
  }

  // Email Marketing
  if (mediumLower === 'email' || sourceLower === 'email' || sourceLower.includes('mail')) {
    return 'email';
  }

  // Direct Traffic
  if (sourceLower === 'direct' || mediumLower === 'none') {
    return 'direct';
  }

  // Referral Traffic
  if (sourceLower === 'referral' || mediumLower === 'referral') {
    return 'referral';
  }

  // App Store Traffic
  if (sourceLower === 'app_store') {
    return 'app_store';
  }

  // Default
  return 'other';
};

// Track page view middleware - Google Analytics style
const trackPageView = async (req, res, next) => {
  const startTime = Date.now();

  try {
    console.log('🔍 TRACKING MIDDLEWARE CALLED:', req.method, req.path, req.headers.referer);

    // Skip tracking for static assets and admin routes
    if (req.path.startsWith('/admin/') ||
        req.path.startsWith('/_next/') ||
        req.path.startsWith('/static/') ||
        req.path.startsWith('/assets/') ||
        req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      console.log('⏭️ Skipping tracking for static/admin assets');
      return next();
    }

    // Check if this is an interaction endpoint (like, comment, scroll)
    const isInteractionRoute = req.path.match(/\/(like|comment|share|bookmark|scroll|events)$/);

    // Only track actual page views (frontend routes only)
    const isPageViewRoute = req.path === '/' || // Home page
                           req.path.startsWith('/article/') || // Article pages
                           req.path.startsWith('/category/') || // Category pages
                           req.path.startsWith('/search') || // Search pages
                           req.path === '/about' ||
                           req.path === '/contact' ||
                           req.path === '/privacy' ||
                           req.path === '/terms' ||
                           req.path === '/newsletter' ||
                           req.path === '/notfound'; // Health check removed to track all sessions

    console.log('✅ Processing session tracking for:', req.path);

    // Extract common data
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Get location data from IP
    const locationData = getLocationFromIP(req.ip || req.connection.remoteAddress || '127.0.0.1');

    // Extract UTM parameters
    const utmData = extractUTMParameters(req.url);

    // Determine traffic source and medium
    const source = determineSource(req.headers.referer, utmData.source, utmData.medium, req.headers['user-agent']);
    const medium = determineMedium(source, utmData.medium, req.headers.referer);

    // Check for existing session cookie
    let sessionId = req.cookies?.session_id;
    let session = null;

    // Try to find an active session for this user
    session = await Session.findActiveSession(sessionId, ipAddress, userAgent);

    // Google Analytics-like Session Management:
    // If traffic source changes (and is not direct), start a new session
    if (session) {
      const isDirect = source === 'direct' || medium === 'none' || medium === 'direct';
      
      if (!isDirect) {
        const currentCampaign = utmData.campaign || null;
        const sessionCampaign = session.campaign || null;
        
        // Check if source, medium, or campaign has changed
        const sourceChanged = session.source !== source;
        const mediumChanged = session.medium !== medium;
        const campaignChanged = sessionCampaign !== currentCampaign;

        if (sourceChanged || mediumChanged || campaignChanged) {
          console.log('🔄 Traffic source changed (Campaign Update). Starting new session.');
          session = null; // Force new session
        }
      }
    }

    if (session) {
      console.log('🔄 Extending existing session:', session.sessionId);
      // Extend the session (don't increment page count here - only for actual page views)
      await session.extendSession();
      sessionId = session.sessionId;
      console.log('💾 Session extended successfully');
    } else {
      // No active session found, create a new one
      sessionId = generateSessionId(req);
      console.log('🆕 Creating new session:', sessionId);
    }

    // Get device info from session if exists, otherwise parse user agent
    let deviceInfo;
    if (session) {
      deviceInfo = {
        deviceType: session.deviceType,
        deviceCategory: session.deviceCategory,
        deviceBrand: session.deviceBrand,
        deviceModel: session.deviceModel,
        isTouchDevice: session.isTouchDevice,
        browser: session.browser,
        browserVersion: session.browserVersion,
        os: session.os,
        osVersion: session.osVersion
      };
    } else {
      const uaData = parseUserAgent(userAgent);
      deviceInfo = {
        deviceType: uaData.deviceType,
        deviceCategory: uaData.deviceCategory,
        deviceBrand: uaData.deviceBrand,
        deviceModel: uaData.deviceModel,
        isTouchDevice: uaData.isTouchDevice,
        browser: uaData.browser,
        browserVersion: uaData.browserVersion,
        os: uaData.os,
        osVersion: uaData.osVersion
      };
    }

    // Get screen resolution from query params if available
    const screenWidth = req.query.screenWidth ? parseInt(req.query.screenWidth) : null;
    const screenHeight = req.query.screenHeight ? parseInt(req.query.screenHeight) : null;
    let screenResolution = screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : null;

    let isSessionNew = false;

    // If we need to create a new session
    if (!session) {

      // Determine continent from country
      const getContinent = (country) => CONTINENT_MAP[country] || 'Unknown';

      // Check if this is a new visitor
      const isNewVisitor = await Session.isNewVisitor(ipAddress, userAgent);

      isSessionNew = true;
      session = new Session({
        sessionId,
        userId: null, // Will be set by auth middleware if user is logged in
        ipAddress,
        userAgent,
        deviceType: deviceInfo.deviceType,
        deviceCategory: deviceInfo.deviceCategory,
        deviceBrand: deviceInfo.deviceBrand,
        deviceModel: deviceInfo.deviceModel,
        screenResolution,
        screenWidth,
        screenHeight,
        isTouchDevice: deviceInfo.isTouchDevice,
        browser: deviceInfo.browser,
        browserVersion: deviceInfo.browserVersion,
        os: deviceInfo.os,
        osVersion: deviceInfo.osVersion,
        country: locationData.country,
        countryCode: locationData.country === 'Local' ? 'LOCAL' : locationData.country,
        city: locationData.city,
        region: locationData.region,
        continent: getContinent(locationData.country),
        referrer: req.headers.referer || null,
        source,
        medium,
        campaign: utmData.campaign,
        startTime: new Date(),
        endTime: new Date(),
        isActive: true,
        pageCount: 1,
        duration: 0,
        isNewVisitor
      });

      await session.save();
      console.log('💾 New session saved successfully');
    } else if (!screenResolution && session.screenResolution) {
      // Use existing session's screen resolution if not provided in current request
      screenResolution = session.screenResolution;
    }

    // Only create PageView and update analytics for actual page views
    if (isPageViewRoute) {
      // Update previous page view's "Time on Page" and "Bounce" status
      if (!isSessionNew && sessionId) {
        try {
          const lastPageView = await PageView.findOne({ sessionId }).sort({ createdAt: -1 });

          if (lastPageView) {
            // Calculate time spent on the previous page (in seconds)
            const timeOnPage = (Date.now() - new Date(lastPageView.createdAt).getTime()) / 1000;
            lastPageView.timeOnPage = timeOnPage;
            lastPageView.isBounce = false; // User navigated to another page, so previous wasn't a bounce
            await lastPageView.save();
          }
        } catch (err) {
          console.error('⚠️ Error updating previous page view:', err);
        }
      }

      // Extract article ID from URL if it's an article page
      let articleId = null;

      // Handle frontend routes (e.g., /article/123) and API routes (e.g., /api/articles/123)
      if (req.path.startsWith('/article/') || req.path.startsWith('/api/articles/')) {
        const pathParts = req.path.split('/');
        // Find the part that looks like an ID (Mongo ObjectId is 24 hex chars)
        // or if your system uses numeric IDs, adjust regex accordingly.
        // Assuming standard Mongo ObjectIds or numeric IDs at the end or before 'view'

        for (const part of pathParts) {
          // Check for Mongo ObjectId (24 hex characters)
          if (/^[0-9a-fA-F]{24}$/.test(part)) {
            articleId = part;
            break;
          }
          // Fallback for numeric IDs if used
          if (/^\d+$/.test(part) && part.length > 5) { // Simple heuristic
            articleId = part;
            break;
          }
        }
      }

      // Create PageView record for analytics
      try {
        const pageView = new PageView({
          sessionId,
          userId: null, // Will be set by auth middleware if user is logged in
          articleId,
          pageUrl: req.originalUrl || req.url,
          pageTitle: null, // Will be set by frontend if available
          referrer: req.headers.referer || null,
          source,
          medium,
          campaign: utmData.campaign,
          content: utmData.content,
          term: utmData.term,
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          country: locationData.country,
          city: locationData.city,
          region: locationData.region,
          deviceType: deviceInfo.deviceType,
          deviceCategory: deviceInfo.deviceCategory,
          browser: deviceInfo.browser,
          os: deviceInfo.os,
          screenResolution,
          language: req.headers['accept-language'] || null,
          timezone: null, // Will be set by frontend if available
          timeOnPage: 0,
          isBounce: isSessionNew, // Only true if it's the start of a session
          isNewSession: isSessionNew,
          createdAt: new Date()
        });

        await pageView.save();
        console.log('📄 PageView saved successfully');

        // Increment article view count if this is an article page
        if (articleId && !isInteractionRoute) {
          // Google-like logic: Only increment view count if unique for this session
          // This prevents F5/refresh spam from inflating views
          const hasViewedInSession = await PageView.exists({
            sessionId,
            articleId,
            _id: { $ne: pageView._id } // Exclude the current pageview we just created
          });

          if (!hasViewedInSession) {
            try {
              await Article.findByIdAndUpdate(articleId, {
                $inc: { views: 1 },
                $set: { lastViewedAt: new Date() }
              });
              console.log(`📈 Article ${articleId} view count incremented (Unique Session View)`);
            } catch (articleError) {
              console.error('⚠️ Error updating article view count:', articleError);
            }
          }
        }
      } catch (pageViewError) {
        console.error('PageView creation error:', pageViewError);
        // Don't fail the request if PageView creation fails
      }
    } else {
      console.log('⏭️ Session extended without creating pageview (not a page view route)');
    }

    // Set session cookie
    res.cookie('session_id', sessionId, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: false, // Allow on localhost
      sameSite: 'lax'
    });

    return next();
  } catch (error) {
    console.error('Tracking middleware error:', error);
    next(); // Don't block request if tracking fails
  }
};

// Track event function
const trackEvent = async (eventData) => {
  try {
    const {
      sessionId,
      userId,
      articleId,
      eventType,
      eventData: customData = {},
      metadata = {}
    } = eventData;
    
    // Create event record
    const event = new Event({
      sessionId,
      userId,
      articleId,
      eventType,
      eventData: customData,
      metadata: {
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null,
        referrer: metadata.referrer || null,
        pageUrl: metadata.pageUrl || null,
        screenResolution: metadata.screenResolution || null
      },
      createdAt: new Date()
    });
    
    await event.save();
    
    // Update article counters for engagement events
    if (articleId && ['like', 'comment', 'share', 'bookmark'].includes(eventType)) {
      const updateField = eventType === 'share' ? 'shares' : `${eventType}s`;
      await Article.findByIdAndUpdate(articleId, {
        $inc: { [updateField]: 1 }
      });
    }
    
    return event;
  } catch (error) {
    console.error('Event tracking error:', error);
    return null;
  }
};

// Track scroll depth
const trackScrollDepth = async (data) => {
  try {
    const { articleId, sessionId, userId, depth } = data;

    if (!articleId || !depth) return null;

    // Track as event
    await trackEvent({
      sessionId,
      userId,
      articleId,
      eventType: 'scroll',
      eventData: { depth }
    });

    // Update article scroll depth
    await Article.findByIdAndUpdate(articleId, {
      $inc: { 'scrollDepth.$[elem].count': 1 }
    }, {
      arrayFilters: [{ 'elem.depth': depth }],
      upsert: true
    }).catch(async () => {
      // If the depth doesn't exist, add it
      await Article.findByIdAndUpdate(articleId, {
        $push: {
          scrollDepth: { depth, count: 1 }
        }
      });
    });

    return true;
  } catch (error) {
    console.error('Scroll depth tracking error:', error);
    return false;
  }
};

// Clean up expired sessions - Google Analytics style
const cleanupExpiredSessions = async () => {
  try {
    const cutoffTime = new Date(Date.now() - SESSION_CONFIG.inactivityTimeout);

    // Find sessions that have been inactive for too long
    const expiredSessions = await Session.find({
      endTime: { $lt: cutoffTime },
      isActive: true
    });

    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaning up ${expiredSessions.length} expired sessions`);

      // Update expired sessions
      await Session.updateMany(
        {
          endTime: { $lt: cutoffTime },
          isActive: true
        },
        {
          $set: {
            isActive: false,
            endTime: new Date()
          }
        }
      );

      // Update final page view for each expired session (mark as bounce if only 1 page)
      for (const session of expiredSessions) {
        try {
          const pageViews = await PageView.find({ sessionId: session.sessionId }).sort({ createdAt: -1 });

          if (pageViews.length > 0) {
            const lastPageView = pageViews[0];

            // Calculate time on last page
            const timeOnPage = Math.round((session.endTime - new Date(lastPageView.createdAt)) / 1000);
            lastPageView.timeOnPage = timeOnPage;

            // Mark as bounce if this was the only page in the session
            if (session.pageCount === 1) {
              lastPageView.isBounce = true;
            }

            await lastPageView.save();
          }
        } catch (err) {
          console.error(`⚠️ Error updating final page view for session ${session.sessionId}:`, err);
        }
      }
    }

    return expiredSessions.length;
  } catch (error) {
    console.error('Session cleanup error:', error);
    return 0;
  }
};

// Get real-time session metrics
const getRealtimeMetrics = async () => {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const activeSessions = await Session.countDocuments({
      endTime: { $gte: fiveMinutesAgo },
      isActive: true
    });

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayPageViews = await PageView.countDocuments({
      createdAt: { $gte: todayStart }
    });

    const todaySessions = await Session.countDocuments({
      createdAt: { $gte: todayStart }
    });

    return {
      activeUsers: activeSessions,
      pageViewsToday: todayPageViews,
      sessionsToday: todaySessions,
      timestamp: now
    };
  } catch (error) {
    console.error('Realtime metrics error:', error);
    return null;
  }
};

// Export middleware and functions
module.exports = {
  trackPageView,
  trackEvent,
  trackScrollDepth,
  cleanupExpiredSessions,
  getRealtimeMetrics,
  generateSessionId,
  parseUserAgent,
  getLocationFromIP,
  extractUTMParameters,
  determineSource,
  determineMedium,
  categorizeTrafficSource
};
