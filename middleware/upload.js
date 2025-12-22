const multer = require('multer');
const path = require('path');

// Configure multer for disk storage (saves files to uploads folder)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    const fs = require('fs');
    const uploadDir = 'uploads/ads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// Configure file filter for both images and videos
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|webm|ogg|mov|avi/;
  
  const extname = path.extname(file.originalname).toLowerCase().replace('.', '');
  const mimetype = file.mimetype;

  // Check if it's an image
  const isImage = mimetype.startsWith('image/') && allowedImageTypes.test(extname);
  // Check if it's a video
  const isVideo = mimetype.startsWith('video/') && allowedVideoTypes.test(extname);

  if (isImage || isVideo) {
    // Add file type to request for later use
    if (!req.fileTypes) req.fileTypes = [];
    req.fileTypes.push({
      fieldname: file.fieldname,
      type: isImage ? 'image' : 'video',
      mimetype: mimetype
    });
    return cb(null, true);
  } else {
    cb(new Error(`Unsupported file type. Allowed: images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, OGG, MOV, AVI)`));
  }
};

// Create different upload configurations
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for videos
  },
  fileFilter: fileFilter
});

// Single file upload with 50MB limit for videos
const uploadSingle = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: fileFilter
}).single('file');

// Multiple files upload with 10 files max, 50MB each
const uploadMultiple = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 10 // Maximum 10 files
  },
  fileFilter: fileFilter
}).array('files', 10);

// Single image upload with 10MB limit
const uploadImage = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
    }
  }
}).single('image');

// Single video upload with 50MB limit
const uploadVideo = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|webm|ogg|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.startsWith('video/');

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files (MP4, WebM, OGG, MOV, AVI) are allowed'));
    }
  }
}).single('video');

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large. Maximum size is 50MB for videos and 10MB for images.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Maximum 10 files allowed.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected field name for file upload.';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in the form.';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long.';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long.';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields in the form.';
        break;
      default:
        message = `File upload error: ${error.message}`;
    }
    
    return res.status(400).json({
      success: false,
      error: message
    });
  } else if (error) {
    // Custom errors from fileFilter
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  next();
};

// Utility function to validate file before upload
const validateFile = (file, maxSize = 50 * 1024 * 1024) => {
  const errors = [];
  
  if (!file) {
    errors.push('No file provided');
    return { isValid: false, errors };
  }

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size exceeds ${maxSize / (1024 * 1024)}MB limit`);
  }

  // Check file type
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
  
  const isImage = allowedImageTypes.includes(file.mimetype);
  const isVideo = allowedVideoTypes.includes(file.mimetype);
  
  if (!isImage && !isVideo) {
    errors.push('File must be an image (JPEG, PNG, GIF, WebP) or video (MP4, WebM, OGG, MOV, AVI)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    type: isImage ? 'image' : isVideo ? 'video' : 'unknown'
  };
};

// Middleware to clean up uploaded files on error
const cleanupUploadedFiles = (req, res, next) => {
  // If there's an error response and files were uploaded, delete them
  const originalSend = res.send;
  res.send = function(data) {
    if (res.statusCode >= 400 && req.files) {
      const fs = require('fs');
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`Cleaned up uploaded file: ${file.path}`);
        } catch (error) {
          console.error('Error cleaning up file:', error);
        }
      });
    }
    originalSend.call(this, data);
  };
  next();
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadImage,
  uploadVideo,
  handleUploadError,
  validateFile,
  cleanupUploadedFiles
};