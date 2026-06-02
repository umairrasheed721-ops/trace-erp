const { google } = require('googleapis');
const { Readable } = require('stream');

console.log('💎 [Google Drive Service] Initializing integration...');

let drive = null;

try {
  const credentialsJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT;
  if (!credentialsJson) {
    console.warn('⚠️ [Google Drive Service] Warning: GOOGLE_DRIVE_SERVICE_ACCOUNT environment variable is not defined.');
  } else {
    const credentials = JSON.parse(credentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    drive = google.drive({ version: 'v3', auth });
    console.log('✅ [Google Drive Service] Authenticated successfully with Google Drive.');
  }
} catch (e) {
  console.error('❌ [Google Drive Service] Error parsing credentials or authenticating:', e.message);
}

/**
 * Uploads a file buffer directly to Google Drive and makes it publicly viewable.
 * @param {Buffer} buffer The file contents as a buffer
 * @param {string} fileName The destination file name
 * @param {string} mimeType The mime type (e.g. image/jpeg, audio/ogg)
 * @returns {Promise<{id: string, url: string} | null>} File details or null on failure
 */
async function uploadBufferToDrive(buffer, fileName, mimeType) {
  const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!parentFolderId || parentFolderId.trim() === '') {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is undefined or empty. A valid folder ID must be provided to upload via Service Account.');
  }

  if (!drive) {
    console.warn('⚠️ [Google Drive Service] Skip upload: Google Drive client is not initialized.');
    return null;
  }

  try {
    const fileMetadata = {
      name: fileName,
      parents: [parentFolderId]
    };

    const bufferStream = Readable.from(buffer);

    console.log(`📡 [Google Drive Service] Uploading ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)...`);
    
    const response = await drive.files.create({
      requestBody: fileMetadata,
      resource: fileMetadata, // backwards compatibility
      media: {
        mimeType: mimeType,
        body: bufferStream
      },
      fields: 'id, name, webViewLink, webContentLink'
    });

    const fileId = response.data.id;
    if (!fileId) {
      throw new Error('Upload returned empty File ID.');
    }

    console.log(`✅ [Google Drive Service] Uploaded file successfully. Drive ID: ${fileId}`);

    // Create permission to make the file readable by anyone with the link
    try {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
      console.log(`🔓 [Google Drive Service] Set public read permissions for file ${fileId}`);
    } catch (permErr) {
      console.warn(`⚠️ [Google Drive Service] Failed to set public permissions for ${fileId}:`, permErr.message);
    }

    // Direct download link format
    const directUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
    return {
      id: fileId,
      url: directUrl
    };

  } catch (err) {
    console.error('❌ [Google Drive Service] Direct buffer upload failed:', err.message);
    return null;
  }
}

/**
 * Deletes a file from Google Drive.
 * @param {string} fileId The Google Drive file ID
 * @returns {Promise<boolean>} True if deleted successfully, false otherwise
 */
async function deleteFileFromDrive(fileId) {
  if (!drive) {
    console.warn('⚠️ [Google Drive Service] Skip delete: Google Drive client is not initialized.');
    return false;
  }

  try {
    console.log(`📡 [Google Drive Service] Deleting file from Drive: ${fileId}...`);
    await drive.files.delete({
      fileId: fileId
    });
    console.log(`✅ [Google Drive Service] Deleted file ${fileId} from Drive.`);
    return true;
  } catch (err) {
    console.error(`❌ [Google Drive Service] Failed to delete file ${fileId} from Drive:`, err.message);
    return false;
  }
}

module.exports = {
  uploadBufferToDrive,
  deleteFileFromDrive
};
