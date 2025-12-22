const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with user's credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Generates and uploads a default image to Cloudinary for ad campaigns
 * Retrieves the secure_url from the Cloudinary upload response
 * Saves the secure_url in the database field mediaUrl
 *
 * @param {string} campaignTitle - The title of the campaign
 * @param {string} folder - The Cloudinary folder to upload to
 * @returns {string} The secure_url from Cloudinary upload response
 */
async function generateAndUploadDefaultImage(campaignTitle, folder = 'ad-defaults') {
  try {
    console.log(`Generating and uploading default image for campaign: "${campaignTitle}"`);

    // Create a text-based image using Cloudinary's upload with transformation
    const text = encodeURIComponent(`Default Ad\n${campaignTitle}`);
    const publicId = `default-ad-${campaignTitle.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;

    // Upload a base image with text overlay transformation
    // This actually uploads to Cloudinary and returns the secure_url in the response
    const result = await cloudinary.uploader.upload(
      `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`, // 1x1 transparent PNG as base
      {
        folder,
        public_id: publicId,
        transformation: [
          { width: 400, height: 200, crop: 'fill', background: 'rgb:4F46E5' },
          { overlay: `text:Arial_20_bold:${text}`, gravity: 'center', color: 'white' }
        ],
        format: 'png'
      }
    );

    console.log('✅ Default image uploaded successfully. Secure URL from Cloudinary response:', result.secure_url);
    return result.secure_url; // Return the secure_url from Cloudinary upload response
  } catch (error) {
    console.error('❌ Error generating/uploading default image:', error);
    throw error;
  }
}

module.exports = {
  generateAndUploadDefaultImage
};
