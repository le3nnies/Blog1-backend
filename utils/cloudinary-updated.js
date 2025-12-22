const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = async (fileBuffer, folder = 'blog-images') => {
  try {
    // Check if fileBuffer is valid
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Empty or invalid file buffer provided');
    }

    console.log(`Uploading file to Cloudinary: buffer size ${fileBuffer.length} bytes, folder: ${folder}`);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          transformation: [
            { width: 1200, height: 630, crop: 'limit', quality: 'auto' },
            { format: 'webp' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload stream error:', error);
            reject(error);
          } else {
            console.log('Cloudinary upload successful:', result.secure_url);
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

/**
 * Uploads a file to Cloudinary and automatically updates the database document
 * Retrieves the secure_url from the upload response and saves it in the mediaUrl field
 * Handles errors properly if upload or database update fails
 *
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} folder - Cloudinary folder name
 * @param {mongoose.Model} Model - The Mongoose model (e.g., Ad, Article)
 * @param {string} documentId - The document ID to update
 * @param {Object} additionalFields - Additional fields to update in the document
 * @returns {Object} - The upload result and updated document
 */
const uploadToCloudinaryAndUpdateDB = async (fileBuffer, folder = 'blog-images', Model, documentId, additionalFields = {}) => {
  try {
    // Check if fileBuffer is valid
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Empty or invalid file buffer provided');
    }

    console.log(`Uploading file to Cloudinary and updating database document ${documentId} in ${Model.modelName}`);

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          transformation: [
            { width: 1200, height: 630, crop: 'limit', quality: 'auto' },
            { format: 'webp' }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload stream error:', error);
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            console.log('✅ Cloudinary upload successful. Secure URL:', result.secure_url);
            resolve(result);
          }
        }
      );

      uploadStream.end(fileBuffer);
    });

    // Retrieve the secure_url from the upload response
    const secureUrl = uploadResult.secure_url;

    if (!secureUrl) {
      throw new Error('No secure_url returned from Cloudinary upload');
    }

    // Automatically update the corresponding database document with the mediaUrl
    const updateData = {
      mediaUrl: secureUrl, // Save the secure_url in the mediaUrl field
      ...additionalFields
    };

    const updatedDocument = await Model.findByIdAndUpdate(
      documentId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedDocument) {
      throw new Error(`Document with ID ${documentId} not found in ${Model.modelName}`);
    }

    console.log(`✅ Database document ${documentId} updated successfully with mediaUrl: ${secureUrl}`);

    return {
      uploadResult,
      updatedDocument,
      secureUrl
    };

  } catch (error) {
    console.error('❌ Error in uploadToCloudinaryAndUpdateDB:', error.message);

    // Handle errors properly - if upload succeeded but DB update failed, we might want to clean up
    if (error.message.includes('Document with ID') && uploadResult) {
      console.warn('Upload succeeded but database update failed. Consider manual cleanup if needed.');
    }

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
  uploadToCloudinaryAndUpdateDB,
  deleteFromCloudinary,
  extractPublicId
};
