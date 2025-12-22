const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = async (fileBuffer, folder = 'blog-images', options = {}) => {
  try {
    // Check if fileBuffer is valid
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Empty or invalid file buffer provided');
    }

    console.log(`Uploading file to Cloudinary: buffer size ${fileBuffer.length} bytes, folder: ${folder}`);

    // Determine if it's likely a video based on buffer size (videos are typically larger)
    // This is a simple heuristic - you might want to pass mimetype as an option
    const isLikelyVideo = fileBuffer.length > 5 * 1024 * 1024; // > 5MB

    // Default upload options - NO transformations by default to preserve original media
    const defaultOptions = {
      folder: folder,
      resource_type: 'auto', // Automatically detect image/video
      ...options
    };

    // Only apply transformations if explicitly requested via options
    // This ensures users see the exact media they uploaded
    if (options.applyTransformations) {
      // Only apply transformations if not explicitly provided and for images
      if (!options.transformation && !isLikelyVideo) {
        defaultOptions.transformation = [
          { width: 1200, height: 630, crop: 'limit', quality: 'auto' },
          { format: 'webp' }
        ];
      }

      // Add video-specific options if it's likely a video and no explicit options provided
      if (isLikelyVideo && !options.chunk_size && !options.eager) {
        defaultOptions.chunk_size = 6000000; // 6MB chunks for better video upload
        defaultOptions.eager = [
          { quality: "auto", format: "mp4" },
          { quality: "auto", format: "webm" }
        ];
        defaultOptions.eager_async = true;
      }
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        defaultOptions,
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload stream error:', error);
            
            // Provide more specific error messages
            if (error.message.includes('File size too large')) {
              reject(new Error('File size exceeds Cloudinary limits. Maximum size is 100MB for videos and 20MB for images.'));
            } else if (error.message.includes('Unsupported format')) {
              reject(new Error('Unsupported file format. Please use common image or video formats.'));
            } else {
              reject(error);
            }
          } else {
            const resourceType = result.resource_type || 'image';
            console.log(`✅ ${resourceType.toUpperCase()} upload successful:`, result.secure_url);
            console.log('📊 Upload details:', {
              resource_type: result.resource_type,
              format: result.format,
              bytes: result.bytes,
              ...(result.resource_type === 'video' && {
                duration: result.duration,
                bit_rate: result.bit_rate,
                frame_rate: result.frame_rate
              }),
              ...(result.resource_type === 'image' && {
                width: result.width,
                height: result.height
              })
            });
            resolve(result);
          }
        }
      );

      uploadStream.end(fileBuffer);
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

const extractPublicId = (url) => {
  const matches = url.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
  return matches ? matches[1] : null;
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId
};