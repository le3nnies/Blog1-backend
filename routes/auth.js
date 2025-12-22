const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../middleware/validation');

// Public routes
router.post('/register', validateRegistration, authController.register);
router.post('/login', validateLogin, authController.login);

// Protected routes
router.get('/me', authMiddleware, authController.getCurrentUser);
router.put('/profile', authMiddleware, authController.updateProfile);
router.put('/change-password', authMiddleware, authController.changePassword);
router.post('/auth/login', authController.login); // Legacy support
router.post('/logout', authMiddleware, authController.logout);
router.post('/auth/create-admin', authController.createAdmin); // Initial admin creation

// Admin only routes
router.post('/admin/register', 
  authMiddleware, 
  adminMiddleware, 
  validateRegistration, 
  authController.register
);

module.exports = router;