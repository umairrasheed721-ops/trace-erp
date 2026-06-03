const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const https = require('https');
const path = require('path');

console.log('☁️ [Cloudinary Service] Initializing Cloudinary integration...');

// ─── Connection Pooling ───────────────────────────────────────────────────────
// Reuse TCP connections across all Cloudinary API calls.
// keepAlive prevents a new TLS handshake per upload (saves ~200ms each).
// maxSockets caps concurrent outbound sockets to avoid FD exhaustion.
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 25,
  timeout: 30000
});

// Monkey-patch the Cloudinary SDK to use our persistent agent
// The SDK internally uses `https.globalAgent`; overriding it here is the
// cleanest way without forking the SDK.
// See: https://github.com/cloudinary/cloudinary_npm/issues/330
const originalRequest = https.request.bind(https);
// We do NOT override globalAgent because that can affect other modules.
// Instead we rely on the SDK accepting an agent via config (v2 supports it).
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  // Pass the keep-alive agent for all API calls
  agent: keepAliveAgent
});

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  console.log('✅ [Cloudinary Service] Configured successfully with connection pooling (keepAlive=true, maxSockets=25).');
} else {
  console.warn('⚠️ [Cloudinary Service] Warning: Cloudinary credentials are not fully defined in environment.');
}

/**
 * Uploads a file buffer directly to Cloudinary using upload_stream.
 * @param {Buffer|import('stream').Readable} bufferOrStream The file contents as a Buffer or a Readable stream
 * @param {string} fileName The destination file name (used for public_id extraction)
 * @returns {Promise<{id: string, url: string} | null>} Public ID and secure URL, or null on failure
 */
function uploadToCloudinary(bufferOrStream, fileName) {
  return new Promise((resolve) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.warn('⚠️ [Cloudinary Service] Skip upload: Cloudinary client is not fully configured.');
      return resolve(null);
    }

    try {
      const publicIdBase = path.parse(fileName).name;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: publicIdBase,
          folder: 'whatsapp_media'
        },
        (error, result) => {
          if (error) {
            console.error('❌ [Cloudinary Service] Stream upload failed:', error.message);
            return resolve(null);
          }
          console.log(`✅ [Cloudinary Service] Uploaded successfully. Public ID: ${result.public_id}`);
          resolve({
            id: result.public_id,
            url: result.secure_url
          });
        }
      );

      // Accept either a Buffer or an already-open Readable stream
      if (Buffer.isBuffer(bufferOrStream)) {
        Readable.from(bufferOrStream).pipe(uploadStream);
      } else if (bufferOrStream && typeof bufferOrStream.pipe === 'function') {
        // Zero-copy streaming path: Baileys-decrypted stream piped directly
        bufferOrStream.pipe(uploadStream);
      } else {
        console.error('❌ [Cloudinary Service] uploadToCloudinary received invalid input (not a Buffer or Readable).');
        return resolve(null);
      }
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
