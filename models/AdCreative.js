// models/AdCreative.js
const mongoose = require('mongoose');

const adCreativeSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdCampaign',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  imageUrl: {
    type: String,
    required: true
  },
  destinationUrl: {
    type: String,
    required: true
  },
  altText: {
    type: String,
    required: true
  },
  callToAction: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdCreative', adCreativeSchema);