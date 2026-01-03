// routes/ads.js - CLEANED AND FIXED VERSION
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Import the specific auth middleware function
//const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Import models
const AdCampaign = require('../models/AdCampaign');
const GoogleAdConfig = require('../models/GoogleAdConfig');
const AdCreative = require('../models/AdCreative');
const AdStats = require('../models/AdStats');
const Ad = require('../models/Ad');
const ClickAnalytics = require('../models/ClickAnalytics');
const Session = require('../models/Session');
const PageView = require('../models/PageView');

console.log('🎯 routes/ads.js LOADED SUCCESSFULLY!');

// ===== FILE UPLOAD CONFIGURATION =====

// Disk storage for local uploads (if needed)
const uploadsDir = path.join(__dirname, '..', 'uploads', 'ads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, 'ad-' + uniqueSuffix + extension);
  }
});

// Memory storage for Cloudinary uploads
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'), false);
  }
};

const uploadDisk = multer({
  storage: diskStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const uploadMemory = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const uploadSingle = uploadMemory.single('file');
const uploadMultiple = uploadMemory.array('files', 10);

const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB.'
      });
    }
  } else if (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  next();
};

// ===== HELPER FUNCTIONS (DECLARED ONLY ONCE) =====

const getDeviceType = (userAgent) => {
  if (!userAgent) return 'desktop';
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

const getBrowserInfo = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (/chrome/i.test(userAgent)) return 'Chrome';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent)) return 'Safari';
  if (/edge/i.test(userAgent)) return 'Edge';
  return 'Other';
};

const getOSInfo = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad/i.test(userAgent)) return 'iOS';
  return 'Other';
};

const getCountryFromIP = (ip) => {
  return 'US'; // Simplified - implement IP geolocation in production
};

const calculateActualCPC = (campaign) => {
  const baseCPC = campaign.cpc || 0.10;
  const randomVariation = 0.8 + (Math.random() * 0.4);
  return Math.max(baseCPC * randomVariation, 0.01);
};

const calculateWeeklyGrowth = (weeklyData) => {
  if (!weeklyData || weeklyData.length < 2) {
    return {
      revenueGrowth: 0,
      clickGrowth: 0,
      impressionGrowth: 0,
      isPositive: false
    };
  }

  const currentWeek = weeklyData[weeklyData.length - 1];
  const previousWeek = weeklyData[weeklyData.length - 2];

  if (!currentWeek || !previousWeek) {
    return {
      revenueGrowth: 0,
      clickGrowth: 0,
      impressionGrowth: 0,
      isPositive: false
    };
  }

  const revenueGrowth = previousWeek.revenue > 0
    ? ((currentWeek.revenue - previousWeek.revenue) / previousWeek.revenue) * 100
    : currentWeek.revenue > 0 ? 100 : 0;

  const clickGrowth = previousWeek.clicks > 0
    ? ((currentWeek.clicks - previousWeek.clicks) / previousWeek.clicks) * 100
    : currentWeek.clicks > 0 ? 100 : 0;

  const impressionGrowth = previousWeek.impressions > 0
    ? ((currentWeek.impressions - previousWeek.impressions) / previousWeek.impressions) * 100
    : currentWeek.impressions > 0 ? 100 : 0;

  return {
    revenueGrowth: Math.round(revenueGrowth * 100) / 100,
    clickGrowth: Math.round(clickGrowth * 100) / 100,
    impressionGrowth: Math.round(impressionGrowth * 100) / 100,
    isPositive: revenueGrowth > 0
  };
};

// Detect media type from URL
const detectMediaTypeFromUrl = (url) => {
  if (!url) return 'image';

  // Check URL extension for video formats
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.m4v', '.flv'];
  const isVideoFromUrl = videoExtensions.some(ext => url.toLowerCase().includes(ext));

  // Check if URL contains video path indicators
  const hasVideoPath = url.includes('/video/') || url.includes('video=true') || url.includes('/videos/');

  if (isVideoFromUrl || hasVideoPath) {
    return 'video';
  }

  // Default to image for all other cases
  return 'image';
};

const calculateTodaySpent = async (campaignId, cpc) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    const todayClicks = await ClickAnalytics.countDocuments({
      adCampaign: campaignId,
      'clickData.timestamp': { 
        $gte: startOfDay, 
        $lte: endOfDay 
      }
    });
    
    return todayClicks * cpc;
  } catch (error) {
    console.error('Error calculating today spent:', error.message);
    return 0;
  }
};

const trackClickAnalytics = async (campaign, cpc, request) => {
  try {
    if (!request || typeof request !== 'object') {
      console.log('⚠️  No valid request object for analytics');
      return;
    }

    const analyticsData = {
      adCampaign: campaign._id,
      clickData: {
        ipAddress: request.ip || request.connection?.remoteAddress || 'unknown',
        userAgent: request.headers?.['user-agent'] || 'unknown',
        referrer: request.headers?.['referer'] || request.headers?.['referrer'] || 'direct',
        cost: cpc,
        timestamp: new Date()
      },
      sessionId: request.sessionID || `session_${Date.now()}`,
      userId: request.user?._id || null,
      geographicData: {
        country: getCountryFromIP(request.ip),
        region: 'Unknown',
        city: 'Unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      deviceData: {
        type: getDeviceType(request.headers?.['user-agent']),
        browser: getBrowserInfo(request.headers?.['user-agent']),
        os: getOSInfo(request.headers?.['user-agent']),
        screenResolution: 'Unknown'
      },
      campaignContext: {
        position: request.body?.position || 'unknown',
        category: campaign.category || 'general',
        creativeId: campaign.creativeId || campaign._id.toString()
      },
      conversion: {
        converted: false,
        conversionType: null,
        conversionValue: 0,
        conversionDate: null
      }
    };

    await ClickAnalytics.create(analyticsData);
    
    console.log('📊 Click analytics tracked successfully');
    
  } catch (error) {
    console.error('❌ Error tracking click analytics:', error.message);
  }
};

// ===== TEST ROUTES =====

router.get('/test-auth', authMiddleware, (req, res) => {
  res.json({ 
    success: true,
    message: 'Auth is working!', 
    user: req.user 
  });
});

router.get('/test', (req, res) => {
  console.log('✅ GET /api/ads/test route called!');
  res.json({ 
    success: true, 
    message: 'Ads routes are working!',
    timestamp: new Date().toISOString()
  });
});

// ===== AD CAMPAIGN ROUTES =====

router.get('/campaigns', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('Getting campaigns for user:', req.user.email);
    
    const { status, type, advertiser } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (advertiser) query.advertiser = new RegExp(advertiser, 'i');

    const campaigns = await AdCampaign.find(query).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching campaigns' 
    });
  }
});

router.get('/campaigns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const campaign = await AdCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching campaign'
    });
  }
});

router.post('/campaigns', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📥 Creating new campaign for user:', req.user.email);
    console.log('📦 Full request body:', JSON.stringify(req.body, null, 2));
    console.log('🎯 Received targetCategories:', req.body.targetCategories);
    console.log('📍 Received targetPositions:', req.body.targetPositions);
    console.log('🔍 Type of targetCategories:', typeof req.body.targetCategories);
    console.log('🔍 Is array?', Array.isArray(req.body.targetCategories));

    const {
      title,
      description,
      advertiser,
      advertiserEmail,
      advertiserPhone,
      type,
      status,
      budget,
      spent,
      startDate,
      endDate,
      targetCategories,
      targetPositions,
      impressions,
      clicks,
      ctr,
      clickUrl,
      mediaUrl,
      mediaType
    } = req.body;

    if (!title || !advertiser || !budget) {
      return res.status(400).json({
        success: false,
        error: 'Title, advertiser, and budget are required fields'
      });
    }

    // Media URL is now optional - will be set when media is uploaded
    // If no media URL provided, generate a default image URL
    let finalMediaUrl = mediaUrl ? mediaUrl.trim() : '';
    let finalMediaType = mediaType || (finalMediaUrl ? detectMediaTypeFromUrl(finalMediaUrl) : 'image');

    // If no media URL provided, generate a default image
    if (!finalMediaUrl) {
      try {
        const { uploadToCloudinary } = require('../utils/cloudinary');
        // Create a simple colored background as default
        const defaultImageBuffer = Buffer.from(`
          <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="200" fill="#4F46E5"/>
            <text x="200" y="110" font-family="Arial" font-size="24" font-weight="bold" fill="white" text-anchor="middle">
              ${title || 'Default Ad'}
            </text>
          </svg>
        `.trim());

        const cloudinaryResult = await uploadToCloudinary(defaultImageBuffer, 'ad-media', {
          resource_type: 'image',
          format: 'png'
        });

        finalMediaUrl = cloudinaryResult.secure_url;
        finalMediaType = 'image';

        console.log('✅ Generated default media URL:', finalMediaUrl);
      } catch (error) {
        console.error('❌ Error generating default media:', error);
        // Continue without media URL if generation fails
      }
    }

    console.log(`🔍 Auto-detected media type for "${finalMediaUrl}": ${finalMediaType}`);

    // Better array handling with validation
    const sanitizedCategories = Array.isArray(targetCategories) 
      ? targetCategories.filter(cat => cat && cat.trim().length > 0)
      : [];

    const sanitizedPositions = Array.isArray(targetPositions)
      ? targetPositions.filter(pos => pos && pos.trim().length > 0)
      : [];

    console.log('✅ Sanitized categories:', sanitizedCategories);
    console.log('✅ Sanitized positions:', sanitizedPositions);

    const newCampaign = new AdCampaign({
      title: title.trim(),
      description: (description || '').trim(),
      advertiser: advertiser.trim(),
      advertiserEmail: (advertiserEmail || '').trim(),
      advertiserPhone: (advertiserPhone || '').trim(),
      type: type || 'banner',
      status: status || 'pending',
      budget: Number(budget) || 0,
      spent: Number(spent) || 0,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      targetCategories: sanitizedCategories,
      targetPositions: sanitizedPositions,
      impressions: Number(impressions) || 0,
      clicks: Number(clicks) || 0,
      ctr: Number(ctr) || 0,
      clickUrl: (clickUrl || '').trim(),
      mediaUrl: finalMediaUrl.trim(),
      mediaType: finalMediaType,
      createdBy: req.user._id
    });

    console.log('💾 Saving campaign with data:', {
      targetCategories: newCampaign.targetCategories,
      targetPositions: newCampaign.targetPositions
    });

    const savedCampaign = await newCampaign.save();
    
    console.log('✅ Campaign created successfully:', {
      id: savedCampaign._id,
      categories: savedCampaign.targetCategories,
      positions: savedCampaign.targetPositions
    });
    
    res.status(201).json({
      success: true,
      data: savedCampaign,
      message: 'Campaign created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating campaign:', error);
    
    // More specific error handling
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Campaign with this title already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Server error creating campaign: ' + error.message
    });
  }
});

router.put('/campaigns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📥 Updating campaign:', req.params.id);
    console.log('📦 Full update request body:', JSON.stringify(req.body, null, 2));
    console.log('🎯 Update targetCategories:', req.body.targetCategories);
    console.log('📍 Update targetPositions:', req.body.targetPositions);
    console.log('🔍 Type of targetCategories:', typeof req.body.targetCategories);
    console.log('🔍 Is array?', Array.isArray(req.body.targetCategories));

    // Extract and sanitize array fields
    const { targetCategories, targetPositions, ...otherFields } = req.body;

    // Better array handling with validation
    const sanitizedCategories = Array.isArray(targetCategories) 
      ? targetCategories.filter(cat => cat && cat.trim().length > 0)
      : [];

    const sanitizedPositions = Array.isArray(targetPositions)
      ? targetPositions.filter(pos => pos && pos.trim().length > 0)
      : [];

    console.log('✅ Sanitized categories for update:', sanitizedCategories);
    console.log('✅ Sanitized positions for update:', sanitizedPositions);

    // Prepare update data with proper array handling
    const updateData = {
      ...otherFields,
      ...(targetCategories !== undefined && { targetCategories: sanitizedCategories }),
      ...(targetPositions !== undefined && { targetPositions: sanitizedPositions })
    };

    // Clean up other fields
    if (updateData.title) updateData.title = updateData.title.trim();
    if (updateData.description) updateData.description = updateData.description.trim();
    if (updateData.advertiser) updateData.advertiser = updateData.advertiser.trim();
    if (updateData.advertiserEmail) updateData.advertiserEmail = updateData.advertiserEmail.trim();
    if (updateData.advertiserPhone) updateData.advertiserPhone = updateData.advertiserPhone.trim();
    if (updateData.clickUrl) updateData.clickUrl = updateData.clickUrl.trim();
    if (updateData.mediaUrl) updateData.mediaUrl = updateData.mediaUrl.trim();

    // Convert number fields
    if (updateData.budget !== undefined) updateData.budget = Number(updateData.budget);
    if (updateData.spent !== undefined) updateData.spent = Number(updateData.spent);
    if (updateData.impressions !== undefined) updateData.impressions = Number(updateData.impressions);
    if (updateData.clicks !== undefined) updateData.clicks = Number(updateData.clicks);
    if (updateData.ctr !== undefined) updateData.ctr = Number(updateData.ctr);

    // Convert date fields
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

    console.log('💾 Final update data:', updateData);

    const updatedCampaign = await AdCampaign.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCampaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    console.log('✅ Campaign updated successfully:', {
      id: updatedCampaign._id,
      categories: updatedCampaign.targetCategories,
      positions: updatedCampaign.targetPositions
    });

    res.json({
      success: true,
      data: updatedCampaign,
      message: 'Campaign updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating campaign:', error);
    
    // More specific error handling
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Campaign with this title already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Server error updating campaign: ' + error.message
    });
  }
});

router.patch('/campaigns/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = ['draft', 'pending', 'active', 'paused', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const updatedCampaign = await AdCampaign.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updatedCampaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      data: updatedCampaign,
      message: `Campaign status updated to ${status}`
    });
  } catch (error) {
    console.error('Error updating campaign status:', error);
    res.status(500).json({
      success: false,
      error: 'Server error updating campaign status'
    });
  }
});

router.delete('/campaigns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const deletedCampaign = await AdCampaign.findByIdAndDelete(req.params.id);

    if (!deletedCampaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    await AdCreative.deleteMany({ campaignId: req.params.id });

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Server error deleting campaign'
    });
  }
});

// ===== MEDIA LINKING ROUTES =====

// Link uploaded media to a campaign
router.patch('/campaigns/:id/media', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { mediaUrl, mediaType } = req.body;

    if (!mediaUrl) {
      return res.status(400).json({
        success: false,
        error: 'Media URL is required'
      });
    }

    const updatedCampaign = await AdCampaign.findByIdAndUpdate(
      req.params.id,
      {
        mediaUrl: mediaUrl.trim(),
        mediaType: mediaType || 'image'
      },
      { new: true, runValidators: true }
    );

    if (!updatedCampaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    console.log('✅ Media linked to campaign:', {
      campaignId: updatedCampaign._id,
      mediaUrl: updatedCampaign.mediaUrl,
      mediaType: updatedCampaign.mediaType
    });

    res.json({
      success: true,
      data: updatedCampaign,
      message: 'Media linked to campaign successfully'
    });

  } catch (error) {
    console.error('❌ Error linking media to campaign:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error linking media to campaign: ' + error.message
    });
  }
});

// ===== FILE UPLOAD ROUTES =====

// Import Cloudinary utilities
const { uploadToCloudinary, deleteFromCloudinary, extractPublicId } = require('../utils/cloudinary');

router.post('/upload-media', authMiddleware, adminMiddleware, uploadSingle, handleUploadError, async (req, res) => {
  try {
    console.log('📤 Media upload request received');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    console.log('📁 Uploading to Cloudinary...');

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, 'ad-media', {
      resource_type: 'auto'
    });

    console.log('✅ File uploaded to Cloudinary successfully');
    console.log('🌐 Media URL:', cloudinaryResult.secure_url);

    // Determine media type
    const mediaType = cloudinaryResult.resource_type === 'video' ? 'video' : 'image';

    // Check if campaign ID is provided to save media URL directly to database
    const { campaignId } = req.body;
    let updatedCampaign = null;

    if (campaignId) {
      console.log('💾 Saving media URL directly to campaign:', campaignId);

      updatedCampaign = await AdCampaign.findByIdAndUpdate(
        campaignId,
        {
          mediaUrl: cloudinaryResult.secure_url,
          mediaType: mediaType
        },
        { new: true, runValidators: true }
      );

      if (!updatedCampaign) {
        console.warn('⚠️ Campaign not found for media update:', campaignId);
        // Still return success for the upload, but warn about campaign update failure
      } else {
        console.log('✅ Media URL saved to campaign successfully:', {
          campaignId: updatedCampaign._id,
          mediaUrl: updatedCampaign.mediaUrl,
          mediaType: updatedCampaign.mediaType
        });
      }
    }

    // Return media information
    res.json({
      success: true,
      data: {
        url: cloudinaryResult.secure_url,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        mediaType: mediaType,
        cloudinaryPublicId: cloudinaryResult.public_id,
        campaignUpdated: !!campaignId && !!updatedCampaign
      }
    });

  } catch (error) {
    console.error('❌ Upload failed:', error);

    res.status(500).json({
      success: false,
      error: 'Upload failed: ' + error.message
    });
  }
});


router.post('/upload-multiple-media', authMiddleware, adminMiddleware, uploadMultiple, handleUploadError, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const uploads = req.files.map(file => ({
      url: `/uploads/ads/${file.filename}`,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      mediaType: file.mimetype.startsWith('image/') ? 'image' : 'video'
    }));

    res.json({
      success: true,
      data: uploads
    });
  } catch (error) {
    console.error('Error uploading multiple media:', error);
    res.status(500).json({
      success: false,
      error: 'File upload failed: ' + error.message
    });
  }
});

// ===== AD CREATIVE ROUTES =====

router.get('/campaigns/:campaignId/creatives', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const creatives = await AdCreative.find({ campaignId: req.params.campaignId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: creatives
    });
  } catch (error) {
    console.error('Error fetching creatives:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching creatives'
    });
  }
});

router.post('/creatives', authMiddleware, adminMiddleware, uploadDisk.single('file'), handleUploadError, async (req, res) => {
  try {
    const {
      campaignId,
      title,
      description,
      clickUrl,
      mediaType
    } = req.body;

    const campaign = await AdCampaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    const mediaUrl = req.file ? `/uploads/ads/${req.file.filename}` : null;

    const newCreative = new AdCreative({
      campaignId,
      title,
      description,
      clickUrl,
      mediaUrl,
      mediaType: mediaType || (req.file?.mimetype.startsWith('image/') ? 'image' : 'video'),
      status: 'active'
    });

    const savedCreative = await newCreative.save();
    
    res.status(201).json({
      success: true,
      data: savedCreative,
      message: 'Creative uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading creative:', error);
    res.status(500).json({
      success: false,
      error: 'Server error uploading creative'
    });
  }
});

// ===== STATISTICS ROUTES =====

router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let adStats = await AdStats.findOne();
    if (!adStats) {
      adStats = new AdStats();
      await adStats.save();
    }

    await adStats.updateWeeklyRevenue();

    const campaigns = await AdCampaign.find();
    
    const totalRevenue = campaigns.reduce((sum, campaign) => sum + (campaign.spent || 0), 0);
    const totalClicks = campaigns.reduce((sum, campaign) => sum + (campaign.clicks || 0), 0);
    const totalImpressions = campaigns.reduce((sum, campaign) => sum + (campaign.impressions || 0), 0);
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const pendingCampaigns = campaigns.filter(c => c.status === 'pending').length;
    
    const averageCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const averageCPC = totalClicks > 0 ? totalRevenue / totalClicks : 0;
    const averageRPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayCampaigns = campaigns.filter(campaign => 
      campaign.updatedAt >= today
    );
    
    const todayRevenue = todayCampaigns.reduce((sum, campaign) => sum + (campaign.spent || 0), 0);
    const todayClicks = todayCampaigns.reduce((sum, campaign) => sum + (campaign.clicks || 0), 0);
    const todayImpressions = todayCampaigns.reduce((sum, campaign) => sum + (campaign.impressions || 0), 0);

    const weeklyTrends = (adStats.weeklyRevenue || []).map(week => ({
      week: week.week || 'Unknown',
      revenue: week.revenue || 0,
      clicks: week.clicks || 0,
      impressions: week.impressions || 0,
      ctr: week.impressions > 0 ? (week.clicks / week.impressions) * 100 : 0,
      cpc: week.clicks > 0 ? week.revenue / week.clicks : 0,
      rpm: week.impressions > 0 ? (week.revenue / week.impressions) * 1000 : 0
    }));

    const weeklyGrowth = calculateWeeklyGrowth(adStats.weeklyRevenue || []);

    const currentWeekData = adStats.currentWeek || {
      revenue: 0,
      clicks: 0,
      impressions: 0,
      weekNumber: adStats?.getCurrentWeek?.() || 'Current',
      startDate: new Date()
    };

    const responseData = {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalClicks,
      totalImpressions,
      averageCTR: Math.round(averageCTR * 100) / 100,
      averageCPC: Math.round(averageCPC * 100) / 100,
      averageRPM: Math.round(averageRPM * 100) / 100,
      todayClicks: todayClicks,
      todayImpressions: todayImpressions,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      activeCampaigns,
      pendingCampaigns,
      totalCampaigns: campaigns.length,
      
      weeklyAnalytics: {
        currentWeek: currentWeekData,
        weeklyTrends: weeklyTrends,
        weeklyGrowth: weeklyGrowth,
        performance: {
          weeklyAverageRevenue: weeklyTrends.length > 0 
            ? Math.round(weeklyTrends.reduce((sum, week) => sum + week.revenue, 0) / weeklyTrends.length * 100) / 100 
            : 0,
          bestWeek: weeklyTrends.length > 0 
            ? weeklyTrends.reduce((best, week) => week.revenue > best.revenue ? week : best, weeklyTrends[0])
            : null,
          revenueTrend: weeklyGrowth.revenueGrowth > 0 ? 'up' : weeklyGrowth.revenueGrowth < 0 ? 'down' : 'stable'
        }
      },
      
      lastUpdated: new Date()
    };

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching stats' 
    });
  }
});

// ===== GOOGLE ADS ROUTES =====

router.get('/google-configs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const configs = await GoogleAdConfig.find().sort({ position: 1 });
    
    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error('Error fetching Google configs:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error fetching Google configs' 
    });
  }
});

router.post('/google-configs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📥 Creating new Google AdSense config for user:', req.user.email);
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));

    const {
      adUnit,
      adSlot,
      position,
      displayOn,
      maxWidth,
      customStyle,
      size,
      format,
      responsive,
      adSenseData,
      template
    } = req.body;

    if (!adUnit || !adSlot || !position) {
      return res.status(400).json({
        success: false,
        error: 'Ad unit name, ad slot, and position are required'
      });
    }

    // Validate ad slot format (should be a number)
    if (!/^\d+$/.test(adSlot)) {
      return res.status(400).json({
        success: false,
        error: 'Ad slot must be a valid number'
      });
    }

    // Validate size if provided
    if (size && (!size.width || !size.height || size.width <= 0 || size.height <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ad size dimensions'
      });
    }

    const newConfig = new GoogleAdConfig({
      adUnit: adUnit.trim(),
      adSlot: adSlot.trim(),
      position,
      displayOn: Array.isArray(displayOn) ? displayOn : [],
      maxWidth: maxWidth?.trim(),
      customStyle: customStyle?.trim(),
      size: size || { width: 300, height: 250 },
      format: format || 'auto',
      responsive: responsive !== undefined ? responsive : true,
      adSenseData: adSenseData || { adType: 'display', style: 'default' },
      template: template || 'custom',
      performance: {
        impressions: 0,
        clicks: 0,
        ctr: 0,
        earnings: 0,
        lastUpdated: new Date()
      }
    });

    console.log('💾 Saving new Google AdSense config:', {
      adUnit: newConfig.adUnit,
      position: newConfig.position,
      size: newConfig.size
    });

    const savedConfig = await newConfig.save();

    console.log('✅ Google AdSense config created successfully:', {
      id: savedConfig._id,
      adUnit: savedConfig.adUnit
    });

    res.status(201).json({
      success: true,
      data: savedConfig,
      message: 'Google AdSense config created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating Google AdSense config:', error);

    // More specific error handling
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'An ad unit with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error creating Google AdSense config: ' + error.message
    });
  }
});

router.put('/google-configs/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📥 Updating Google AdSense config:', req.params.id);
    console.log('📦 Update data:', JSON.stringify(req.body, null, 2));

    const updateData = { ...req.body };

    // Clean up string fields
    if (updateData.adUnit) updateData.adUnit = updateData.adUnit.trim();
    if (updateData.adSlot) updateData.adSlot = updateData.adSlot.trim();
    if (updateData.maxWidth) updateData.maxWidth = updateData.maxWidth.trim();
    if (updateData.customStyle) updateData.customStyle = updateData.customStyle.trim();

    // Validate ad slot format if provided
    if (updateData.adSlot && !/^\d+$/.test(updateData.adSlot)) {
      return res.status(400).json({
        success: false,
        error: 'Ad slot must be a valid number'
      });
    }

    // Validate size if provided
    if (updateData.size && (!updateData.size.width || !updateData.size.height ||
        updateData.size.width <= 0 || updateData.size.height <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ad size dimensions'
      });
    }

    const updatedConfig = await GoogleAdConfig.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedConfig) {
      return res.status(404).json({
        success: false,
        error: 'Google AdSense config not found'
      });
    }

    console.log('✅ Google AdSense config updated successfully:', {
      id: updatedConfig._id,
      adUnit: updatedConfig.adUnit
    });

    res.json({
      success: true,
      data: updatedConfig,
      message: 'Google AdSense config updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating Google AdSense config:', error);

    // More specific error handling
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'An ad unit with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error updating Google AdSense config: ' + error.message
    });
  }
});

router.delete('/google-configs/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('🗑️ Deleting Google AdSense config:', req.params.id);

    const deletedConfig = await GoogleAdConfig.findByIdAndDelete(req.params.id);

    if (!deletedConfig) {
      return res.status(404).json({
        success: false,
        error: 'Google AdSense config not found'
      });
    }

    console.log('✅ Google AdSense config deleted successfully:', {
      id: deletedConfig._id,
      adUnit: deletedConfig.adUnit
    });

    res.json({
      success: true,
      message: 'Google AdSense config deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting Google AdSense config:', error);
    res.status(500).json({
      success: false,
      error: 'Server error deleting Google AdSense config'
    });
  }
});

// ===== FILE SERVING ROUTES =====

// Serve uploaded media files
router.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: 'File not found'
    });
  }

  // Set appropriate content type based on file extension
  const ext = path.extname(filename).toLowerCase();
  let contentType = 'application/octet-stream';

  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.ogg') contentType = 'video/ogg';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

  // Stream the file
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('error', (error) => {
    console.error('Error streaming file:', error);
    res.status(500).json({
      success: false,
      error: 'Error serving file'
    });
  });
});

// ===== PUBLIC AD DISPLAY ROUTES =====

router.get('/active', async (req, res) => {
  try {
    const { category, position, limit = 4 } = req.query;
    
    console.log('Fetching active ads with filters:', { category, position, limit });
    
    const query = { 
      status: 'active',
      startDate: { $lte: new Date() },
      $or: [
        { endDate: { $gte: new Date() } },
        { endDate: null }
      ]
    };
    
    if (category && category !== 'undefined') {
      query.targetCategories = { $in: [category] };
    }
    
    if (position && position !== 'undefined') {
      query.targetPositions = { $in: [position] };
    }
    
    console.log('MongoDB query:', query);
    
    const activeAds = await AdCampaign.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    console.log('Found active ads:', activeAds.length);
    
    res.json({
      success: true,
      data: activeAds
    });
  } catch (error) {
    console.error('Error fetching active ads:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching ads'
    });
  }
});

// ===== TRACKING ROUTES =====

router.post('/:id/click', async (req, res) => {
  try {
    const campaign = await AdCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Campaign is not active'
      });
    }

    if (campaign.endDate && new Date() > campaign.endDate) {
      campaign.status = 'completed';
      await campaign.save();
      return res.status(400).json({
        success: false,
        error: 'Campaign has ended'
      });
    }

    const actualCPC = calculateActualCPC(campaign);

    if (campaign.budget && campaign.spent >= campaign.budget) {
      campaign.status = 'paused';
      await campaign.save();
      return res.status(400).json({
        success: false,
        error: 'Campaign budget exhausted - campaign paused'
      });
    }

    if (campaign.dailyBudget && campaign.dailyBudget > 0) {
      const todaySpent = await calculateTodaySpent(campaign._id, actualCPC);
      if (todaySpent + actualCPC > campaign.dailyBudget) {
        return res.status(400).json({
          success: false,
          error: 'Daily budget limit reached'
        });
      }
    }

    campaign.clicks += 1;
    campaign.spent = parseFloat((campaign.spent + actualCPC).toFixed(2));
    
    if (campaign.impressions > 0) {
      campaign.ctr = parseFloat(((campaign.clicks / campaign.impressions) * 100).toFixed(2));
    }
    
    campaign.lastClicked = new Date();
    await campaign.save();
    
    await trackClickAnalytics(campaign, actualCPC, req);
    
    console.log(`✅ Ad click tracked: ${campaign.title} - CPC: $${actualCPC.toFixed(2)} - Total spent: $${campaign.spent.toFixed(2)}`);
    
    const responseData = {
      success: true,
      message: 'Click tracked successfully',
      data: {
        campaignId: campaign._id,
        title: campaign.title,
        clicks: campaign.clicks,
        ctr: campaign.ctr || 0,
        spent: campaign.spent,
        cpc: actualCPC,
        remainingBudget: campaign.budget ? parseFloat((campaign.budget - campaign.spent).toFixed(2)) : 'unlimited',
        status: campaign.status
      }
    };

    if (campaign.targetUrl) {
      responseData.redirectUrl = campaign.targetUrl;
    }

    res.json(responseData);

  } catch (error) {
    console.error('❌ Error tracking ad click:', error);
    res.status(500).json({
      success: false,
      error: 'Server error tracking click'
    });
  }
});

router.post('/:id/impression', async (req, res) => {
  try {
    const campaign = await AdCampaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Campaign is not active'
      });
    }

    campaign.impressions += 1;
    
    if (campaign.impressions > 0) {
      campaign.ctr = (campaign.clicks / campaign.impressions) * 100;
    }
    
    await campaign.save();
    
    console.log(`📊 Ad impression tracked: ${campaign.title} - Total impressions: ${campaign.impressions}`);
    
    res.json({
      success: true,
      message: 'Impression tracked successfully',
      data: {
        impressions: campaign.impressions,
        ctr: campaign.ctr
      }
    });
  } catch (error) {
    console.error('Error tracking ad impression:', error);
    res.status(500).json({
      success: false,
      error: 'Server error tracking impression'
    });
  }
});

// ===== ANALYTICS ROUTES =====

router.get('/analytics/detailed', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    const performanceTrends = await ClickAnalytics.aggregate([
      {
        $match: {
          'clickData.timestamp': {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%b %d",
              date: "$clickData.timestamp"
            }
          },
          revenue: { $sum: "$clickData.cost" },
          clicks: { $sum: 1 }
        }
      },
      {
        $project: {
          date: "$_id",
          revenue: { $round: ["$revenue", 2] },
          clicks: 1,
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Provide default performance trends if no data
    const defaultPerformanceTrends = [];
    if (performanceTrends.length === 0) {
      // Generate default data points for the period
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      for (let i = 0; i < Math.min(daysDiff, 7); i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        defaultPerformanceTrends.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
          revenue: 0,
          clicks: 0
        });
      }
    }

    const deviceBreakdown = await ClickAnalytics.aggregate([
      {
        $match: {
          'clickData.timestamp': {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: "$deviceData.type",
          clicks: { $sum: 1 },
          revenue: { $sum: "$clickData.cost" }
        }
      },
      {
        $project: {
          name: "$_id",
          value: "$clicks",
          revenue: { $round: ["$revenue", 2] },
          _id: 0
        }
      }
    ]);

    // Provide default device breakdown if no data
    const defaultDeviceBreakdown = deviceBreakdown.length === 0 ? [
      { name: 'desktop', value: 0, revenue: 0 },
      { name: 'mobile', value: 0, revenue: 0 },
      { name: 'tablet', value: 0, revenue: 0 }
    ] : deviceBreakdown;

    const geographicData = await ClickAnalytics.aggregate([
      {
        $match: {
          'clickData.timestamp': {
            $gte: startDate,
            $lte: endDate
          },
          'geographicData.country': { $ne: null }
        }
      },
      {
        $group: {
          _id: "$geographicData.country",
          clicks: { $sum: 1 },
          revenue: { $sum: "$clickData.cost" }
        }
      },
      {
        $project: {
          country: "$_id",
          clicks: 1,
          revenue: { $round: ["$revenue", 2] },
          _id: 0
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    // Provide default geographic data if no data
    const defaultGeographicData = geographicData.length === 0 ? [
      { country: 'United States', clicks: 0, revenue: 0 },
      { country: 'United Kingdom', clicks: 0, revenue: 0 },
      { country: 'Canada', clicks: 0, revenue: 0 }
    ] : geographicData;

    const campaigns = await AdCampaign.find({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalRevenue = campaigns.reduce((sum, c) => sum + (c.spent || 0), 0);

    const prevStartDate = new Date(startDate);
    const prevEndDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - (endDate - startDate) / (1000 * 60 * 60 * 24));

    const prevCampaigns = await AdCampaign.find({
      createdAt: { $gte: prevStartDate, $lte: prevEndDate }
    });

    const prevClicks = prevCampaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const prevImpressions = prevCampaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const prevRevenue = prevCampaigns.reduce((sum, c) => sum + (c.spent || 0), 0);

    // Calculate real engagement metrics from Session and PageView data
    const [
      currentSessionStats,
      previousSessionStats,
      currentBounceStats,
      previousBounceStats
    ] = await Promise.all([
      // Current period session stats
      Session.aggregate([
        { $match: { endTime: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
            avgPageCount: { $avg: '$pageCount' },
            totalSessions: { $sum: 1 }
          }
        }
      ]),

      // Previous period session stats
      Session.aggregate([
        { $match: { endTime: { $gte: prevStartDate, $lte: prevEndDate } } },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
            avgPageCount: { $avg: '$pageCount' },
            totalSessions: { $sum: 1 }
          }
        }
      ]),

      // Current period bounce rate
      PageView.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: 1 },
            bounceViews: { $sum: { $cond: [{ $eq: ['$isBounce', true] }, 1, 0] } }
          }
        }
      ]),

      // Previous period bounce rate
      PageView.aggregate([
        { $match: { createdAt: { $gte: prevStartDate, $lte: prevEndDate } } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: 1 },
            bounceViews: { $sum: { $cond: [{ $eq: ['$isBounce', true] }, 1, 0] } }
          }
        }
      ])
    ]);

    const currentSessionData = currentSessionStats[0] || { avgDuration: 0, avgPageCount: 0, totalSessions: 0 };
    const previousSessionData = previousSessionStats[0] || { avgDuration: 0, avgPageCount: 0, totalSessions: 0 };
    const currentBounceData = currentBounceStats[0] || { totalViews: 0, bounceViews: 0 };
    const previousBounceData = previousBounceStats[0] || { totalViews: 0, bounceViews: 0 };

    const engagementMetrics = {
      conversionRate: {
        current: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        previous: prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0
      },
      avgSessionDuration: {
        current: currentSessionData.avgDuration ? Math.round(currentSessionData.avgDuration / 60 * 100) / 100 : 0, // Convert to minutes
        previous: previousSessionData.avgDuration ? Math.round(previousSessionData.avgDuration / 60 * 100) / 100 : 0
      },
      bounceRate: {
        current: currentBounceData.totalViews > 0 ? Math.round((currentBounceData.bounceViews / currentBounceData.totalViews) * 100 * 100) / 100 : 0,
        previous: previousBounceData.totalViews > 0 ? Math.round((previousBounceData.bounceViews / previousBounceData.totalViews) * 100 * 100) / 100 : 0
      },
      pagesPerSession: {
        current: Math.round(currentSessionData.avgPageCount * 100) / 100 || 0,
        previous: Math.round(previousSessionData.avgPageCount * 100) / 100 || 0
      }
    };

    res.json({
      success: true,
      data: {
        performanceTrends,
        deviceBreakdown,
        geographicData,
        engagementMetrics,
        summary: {
          totalRevenue,
          totalClicks,
          totalImpressions,
          period: period
        }
      }
    });

  } catch (error) {
    console.error('Error fetching detailed analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching analytics'
    });
  }
});

router.get('/analytics/real-time', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await ClickAnalytics.aggregate([
      {
        $match: {
          'clickData.timestamp': { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$clickData.cost" },
          clicks: { $sum: 1 }
        }
      }
    ]);

    const currentHour = new Date();
    currentHour.setHours(currentHour.getHours() - 1);

    const hourStats = await ClickAnalytics.aggregate([
      {
        $match: {
          'clickData.timestamp': { $gte: currentHour }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$clickData.cost" },
          clicks: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        today: todayStats[0] || { revenue: 0, clicks: 0 },
        lastHour: hourStats[0] || { revenue: 0, clicks: 0 }
      }
    });

  } catch (error) {
    console.error('Error fetching real-time analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching real-time analytics'
    });
  }
});

router.get('/:id/analytics/clicks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await ClickAnalytics.getClickSummary(id, start, end);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching click analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching click analytics'
    });
  }
});

router.get('/:id/analytics/devices', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const deviceData = await ClickAnalytics.aggregate([
      {
        $match: {
          adCampaign: new mongoose.Types.ObjectId(id)
        }
      },
      {
        $group: {
          _id: '$deviceData.type',
          clicks: { $sum: 1 },
          cost: { $sum: '$clickData.cost' },
          conversions: {
            $sum: { $cond: ['$conversion.converted', 1, 0] }
          }
        }
      },
      {
        $project: {
          deviceType: '$_id',
          clicks: 1,
          cost: 1,
          conversions: 1,
          conversionRate: { $divide: ['$conversions', '$clicks'] }
        }
      },
      { $sort: { clicks: -1 } }
    ]);

    res.json({
      success: true,
      data: deviceData
    });
  } catch (error) {
    console.error('Error fetching device analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching device analytics'
    });
  }
});

// Import and use ads settings routes
const adsSettingsRoutes = require('./adsSettings');
router.use('/settings', adsSettingsRoutes);

router.get('/debug-routes', (req, res) => {
  const routes = [];
  
  router.stack.forEach((middleware) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      routes.push({
        method: methods,
        path: middleware.route.path
      });
    }
  });
  
  res.json({
    success: true,
    routes: routes,
    total: routes.length
  });
});

module.exports = router;
