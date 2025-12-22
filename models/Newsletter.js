const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  },
  preferences: {
    categories: [{
      type: String
    }],
    frequency: {
      type: String,
      enum: ['daily', 'weekly'],
      default: 'weekly'
    }
  },
  token: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

// Generate unsubscribe token before save
newsletterSchema.pre('save', function(next) {
  if (this.isNew) {
    this.token = require('crypto').randomBytes(32).toString('hex');
  }
  next();
});

module.exports = mongoose.model('Newsletter', newsletterSchema);