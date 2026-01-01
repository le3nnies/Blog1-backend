const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Article validation rules for CREATE
const validateArticle = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('content')
    .isLength({ min: 100 })
    .withMessage('Content must be at least 100 characters'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('slug')
    .trim()
    .notEmpty()
    .withMessage('Slug is required'),
  body('author')
    .optional()
    .isMongoId()
    .withMessage('Author must be a valid ObjectId'),
  handleValidationErrors
];

// Article validation rules for UPDATE (optional fields)
const validateArticleUpdate = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('content')
    .optional()
    .isLength({ min: 100 })
    .withMessage('Content must be at least 100 characters'),
  body('category')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Category is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('slug')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Slug is required'),
  body('author')
    .optional()
    .isMongoId()
    .withMessage('Author must be a valid ObjectId'),
  handleValidationErrors
];

// User registration validation
const validateRegistration = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .isAlphanumeric()
    .withMessage('Username must be alphanumeric'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  handleValidationErrors
];

// Login validation
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Newsletter subscription validation
const validateNewsletter = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  handleValidationErrors
];

module.exports = {
  validateArticle,
  validateArticleUpdate, // Add this export
  validateRegistration,
  validateLogin,
  validateNewsletter,
  handleValidationErrors
};