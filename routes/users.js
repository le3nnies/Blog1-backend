const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// All routes require authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all users (with optional role filtering)
router.get('/', userController.getAllUsers);

// Get user by ID
router.get('/:id', userController.getUserById);

// Update user
router.put('/:id', userController.updateUser);

// Update user role
router.put('/:id/role', userController.updateUserRole);

// Update user status
router.put('/:id/status', userController.updateUserStatus);

// Delete user
router.delete('/:id', userController.deleteUser);

// Get user articles
router.get('/:id/articles', userController.getUserArticles);

// System health
router.get('/system/health', userController.getSystemHealth);

// Create backup
router.post('/system/backup', userController.createBackup);

// Get system logs
router.get('/system/logs', userController.getSystemLogs);

module.exports = router;
