// routes/ads.js - MINIMAL WORKING VERSION
const express = require('express');
const router = express.Router();

console.log('✅ routes/ads.js LOADED SUCCESSFULLY!');

// Test route - NO IMPORTS, NO MIDDLEWARE
router.get('/test', (req, res) => {
  console.log('✅ /api/ads/test called successfully!');
  res.json({ 
    success: true, 
    message: 'Basic ads routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Campaigns route - SIMPLE VERSION
router.get('/campaigns', (req, res) => {
  console.log('✅ /api/ads/campaigns called');
  res.json({ 
    success: true, 
    data: [],
    message: 'Campaigns endpoint working (no data yet)'
  });
});

// Stats route - SIMPLE VERSION  
router.get('/stats', (req, res) => {
  console.log('✅ /api/ads/stats called');
  res.json({
    success: true,
    data: {
      totalRevenue: 0,
      totalClicks: 0,
      totalImpressions: 0,
      activeCampaigns: 0,
      pendingCampaigns: 0,
      totalCampaigns: 0
    }
  });
});

// Google configs route - SIMPLE VERSION
router.get('/google-configs', (req, res) => {
  console.log('✅ /api/ads/google-configs called');
  res.json({
    success: true,
    data: []
  });
});

module.exports = router;