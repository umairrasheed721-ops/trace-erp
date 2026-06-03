const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const path = require('path');

console.log('☁️ [Cloudinary Service] Initializing Cloudinary integration...');

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ [Cloudinary Service] Configured successfully with Cloudinary.');
} else {
  console.warn('⚠️ [Cloudinary Service] Warning: Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are not fully defined in environment.');
}

/**
 * Uploads a file buffer directly to Cloudinary using upload_stream.
 * @param {Buffer} buffer The file contents as a buffer
 * @param {string} fileName The destination file name (used for public_id extraction)
 * @returns {Promise<{id: string, url: string} | null>} Public ID and secure URL, or null on failure
 */
function uploadToCloudinary(buffer, fileName) {
  return new Promise((resolve) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('⚠️ [Cloudinary Service] Skip upload: Cloudinary client is not fully configured.');
      return resolve(null);
    }

    try {
      // Extract the filename without extension to use as a clean public_id prefix
      const publicIdBase = path.parse(fileName).name;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: publicIdBase,
          folder: 'whatsapp_media'
        },
        (error, result) => {
          if (error) {
            console.error('❌ [Cloudinary Service] Buffer upload failed:', error.message);
            return resolve(null);
          }
          console.log(`✅ [Cloudinary Service] Uploaded file successfully. Public ID: ${result.public_id}`);
          resolve({
            id: result.public_id,
            url: result.secure_url
          });
        }
      );

      Readable.from(buffer).pipe(uploadStream);
    } catch (err) {
      console.error('❌ [Cloudinary Service] Error creating or writing to upload stream:', err.message);
      resolve(null);
    }
  });
}

/**
 * Deletes an asset from Cloudinary using destroy.
 * @param {string} publicId The Cloudinary public ID
 * @returns {Promise<boolean>} True if deleted successfully, false otherwise
 */
function deleteFromCloudinary(publicId) {
  return new Promise((resolve) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('⚠️ [Cloudinary Service] Skip delete: Cloudinary client is not fully configured.');
      return resolve(false);
    }

    try {
      console.log(`📡 [Cloudinary Service] Deleting file from Cloudinary: ${publicId}...`);
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) {
          console.error(`❌ [Cloudinary Service] Failed to delete file ${publicId}:`, error.message);
          return resolve(false);
        }
        console.log(`✅ [Cloudinary Service] Deleted file ${publicId} from Cloudinary. Result:`, result);
        resolve(result && result.result === 'ok');
      });
    } catch (err) {
      console.error(`❌ [Cloudinary Service] Error during deletion of ${publicId}:`, err.message);
      resolve(false);
    }
  });
}

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary
};
