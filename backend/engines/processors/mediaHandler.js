const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { transcodeToOpus, safeUnlink, TAG: FFMPEG_TAG } = require('../ffmpeg_transcode');

// ─── Concurrency Limiter ──────────────────────────────────────────────────────
let uploadQueue;
(async () => {
  try {
    const { default: PQueue } = await import('p-queue');
    uploadQueue = new PQueue({ concurrency: 3 });
    console.log('✅ [MediaProcessor] Upload concurrency queue initialized (max 3 parallel).');
  } catch (err) {
    console.error('❌ [MediaProcessor] Failed to initialize p-queue:', err.message);
    uploadQueue = { add: (fn) => fn() };
  }
})();

const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return SILENT_LOGGER; },
};

function getSecureMediaPath(fileName) {
  const paths = [
    path.join('/app/data/media', fileName),
    path.join('/app/data/uploads', fileName),
    path.join(process.cwd(), 'data', 'media', fileName)
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function saveMediaFile(msg, mediaDetails, downloadMediaMessage) {
  console.log('📸 [MediaProcessor] Media received, queuing Cloudinary upload...');
  try {
    const { uploadToCloudinary } = require('../../services/googleDrive');

    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'audio/ogg; codecs=opus': 'ogg',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'video/mp4': 'mp4'
    };

    let ext = 'bin';
    if (mediaDetails.mimeType) {
      const baseMime = mediaDetails.mimeType.split(';')[0].trim();
      ext = extMap[baseMime] || extMap[mediaDetails.mimeType] || baseMime.split('/')[1] || 'bin';
    }

    const uuid = crypto.randomUUID();
    const fileName = `${uuid}.${ext}`;

    console.log(`📥 [MediaProcessor] Streaming media for message ${msg.key.id} (${mediaDetails.mimeType})...`);
    let mediaStream;
    try {
      mediaStream = await downloadMediaMessage(
        msg,
        'stream',
        {},
        { logger: SILENT_LOGGER }
      );
    } catch (downloadErr) {
      console.error('❌ [MediaProcessor] Baileys media decryption failed:', downloadErr.message);
      return null;
    }

    if (!mediaStream) {
      console.warn(`⚠️ [MediaProcessor] downloadMediaMessage returned null for ${msg.key.id}`);
      return null;
    }

    console.log(`💾 [MediaProcessor] Queueing Cloudinary upload: ${fileName}`);
    const driveFile = await (uploadQueue
      ? uploadQueue.add(() => uploadToCloudinary(mediaStream, fileName))
      : uploadToCloudinary(mediaStream, fileName)
    );

    if (driveFile) {
      console.log(`✅ [MediaProcessor] Cloudinary upload successful. ID=${driveFile.id}, URL=${driveFile.url}`);
      return { url: driveFile.url, id: driveFile.id };
    } else {
      console.warn(`⚠️ [MediaProcessor] Cloudinary upload returned null for message ${msg.key.id}`);
    }
  } catch (error) {
    console.error('❌ [MediaProcessor] Cloudinary Upload Failed:', error.message);
  }
  return null;
}

async function handleAudioTranscode(mediaUrl, mediaType, pendingAckPath, safeSend, jid) {
  const resolvedPath = getSecureMediaPath(path.basename(mediaUrl)) || (fs.existsSync(path.resolve(mediaUrl)) ? path.resolve(mediaUrl) : null);
  let sentMsg;
  if (!resolvedPath) {
    console.warn(`${FFMPEG_TAG} SOURCE_MISSING local path for=${mediaUrl}. Falling back to URL payload.`);
    const payload = {
      audio: { url: mediaUrl },
      ptt: true,
      mimetype: 'audio/mp4'
    };
    sentMsg = await safeSend(jid, payload);
  } else {
    const absInputPath = resolvedPath;
    let transcodeOutputPath = null;
    let finalAudioBuffer = null;
    let finalMime = 'audio/ogg; codecs=opus';

    try {
      const inputSizeBytes = fs.statSync(absInputPath).size;
      console.log(`${FFMPEG_TAG} INPUT  path=${absInputPath}  size=${inputSizeBytes}B  type=${mediaType}`);
      const result = await transcodeToOpus(absInputPath);
      transcodeOutputPath = result.outputPath;
      const outStat = fs.statSync(transcodeOutputPath);
      console.log(`${FFMPEG_TAG} OUTPUT path=${transcodeOutputPath}  size=${outStat.size}B  duration=${result.durationSec}s`);
      finalAudioBuffer = fs.readFileSync(transcodeOutputPath);
      if (finalAudioBuffer.length < 100) {
        throw new Error(`${FFMPEG_TAG} Output buffer suspiciously small (${finalAudioBuffer.length}B) — transcode likely failed`);
      }
    } catch (transcodeErr) {
      console.error(`${FFMPEG_TAG} TRANSCODE_FAIL  error=${transcodeErr.message}`);
      try {
        finalAudioBuffer = fs.readFileSync(absInputPath);
        finalMime = 'audio/mp4';
        console.warn(`${FFMPEG_TAG} FALLBACK  sending raw file with mime=audio/mp4`);
      } catch (readErr) {
        console.error(`${FFMPEG_TAG} READ_FAIL  error=${readErr.message}`);
        finalAudioBuffer = null;
      }
    }

    let payload;
    if (finalAudioBuffer) {
      payload = {
        audio: finalAudioBuffer,
        ptt: true,
        mimetype: finalMime,
      };

      if (pendingAckPath) {
        try {
          fs.writeFileSync(pendingAckPath, finalAudioBuffer);
          console.log(`[PENDING_ACK] Saved audio VN buffer to: ${pendingAckPath}`);
        } catch (err) {
          console.error('⚠️ Failed to save pending_ack voice note:', err.message);
        }
      }

      console.log(`${FFMPEG_TAG} SEND  jid=${jid}  mime=${finalMime}  bufSize=${finalAudioBuffer.length}B  ptt=true`);
    } else {
      console.warn(`${FFMPEG_TAG} Fallback to URL payload due to read/transcode failure.`);
      payload = {
        audio: { url: mediaUrl },
        ptt: true,
        mimetype: 'audio/mp4'
      };
    }

    try {
      sentMsg = await safeSend(jid, payload);
    } finally {
      if (transcodeOutputPath && transcodeOutputPath !== absInputPath) {
        try { await safeUnlink(transcodeOutputPath); } catch(_) {}
      }
    }
  }
  return sentMsg;
}

module.exports = {
  getSecureMediaPath,
  saveMediaFile,
  handleAudioTranscode
};
