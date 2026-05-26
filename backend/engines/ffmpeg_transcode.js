'use strict';
/**
 * ffmpeg_transcode.js — WhatsApp-Native Audio Transcoder
 *
 * Converts any incoming audio blob (webm, mp4, wav, m4a …) into the
 * ONLY format WhatsApp mobile accepts for PTT voice notes:
 *   - Container : OGG
 *   - Codec     : libopus
 *   - Sample Rate: 48 000 Hz
 *   - Bitrate   : 16 kbps
 *   - Channels  : Mono (1)
 *
 * Uses fluent-ffmpeg (stream-based) instead of child_process.exec
 * to avoid shell-injection risks and to guarantee proper process cleanup.
 *
 * Usage:
 *   const { transcodeToOpus } = require('./ffmpeg_transcode');
 *   const { outputPath, durationSec } = await transcodeToOpus('/path/to/input.webm');
 */

const ffmpeg      = require('fluent-ffmpeg');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');

// ── Constants ────────────────────────────────────────────────────────────────
const TIMEOUT_MS  = 20_000;   // Hard kill after 20 s
const TAG         = '[FFMPEG_ENCODE]';
const SAMPLE_RATE = 48000;
const BITRATE     = '16k';
const CHANNELS    = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive the output path: same directory as input, same stem, .ogg extension.
 * Falls back to OS temp dir if input directory is not writable.
 */
function resolveOutputPath(inputPath) {
  try {
    const dir  = path.dirname(path.resolve(inputPath));
    const stem = path.basename(inputPath, path.extname(inputPath));
    const out  = path.join(dir, `${stem}_opus.ogg`);
    // Quick write-access probe
    fs.accessSync(dir, fs.constants.W_OK);
    return out;
  } catch (_) {
    const stem = path.basename(inputPath, path.extname(inputPath));
    return path.join(os.tmpdir(), `${stem}_opus.ogg`);
  }
}

// ── Core Transcoder ───────────────────────────────────────────────────────────

/**
 * transcodeToOpus
 *
 * @param {string} inputPath   Absolute path to the source audio file.
 * @param {object} [opts]
 * @param {string} [opts.outputPath]  Override the output path.
 * @param {number} [opts.timeoutMs]   Override the hard-kill timeout (ms).
 * @returns {Promise<{ outputPath: string, durationSec: number|null }>}
 * @throws  Error if transcoding fails or times out.
 */
function transcodeToOpus(inputPath, opts = {}) {
  const absInput = path.resolve(inputPath);
  const absOutput = opts.outputPath || resolveOutputPath(absInput);
  const timeout   = opts.timeoutMs  || TIMEOUT_MS;

  const startTime = Date.now();
  console.log(`${TAG} START  input=${absInput}  output=${absOutput}`);

  return new Promise((resolve, reject) => {
    let settled   = false;
    let killTimer = null;

    const command = ffmpeg(absInput)
      .noVideo()
      .audioCodec('libopus')
      .audioFrequency(SAMPLE_RATE)
      .audioBitrate(BITRATE)
      .audioChannels(CHANNELS)
      .outputOptions([
        '-application voip',      // PTT-optimised Opus application profile
        '-packet_loss 10',        // Resilience for mobile networks
        '-vbr on',                // Variable bitrate — smaller file size
        '-compression_level 10',  // Highest compression
      ])
      .format('ogg')
      .output(absOutput);

    // ── Hard-kill watchdog ──────────────────────────────────────────────────
    killTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(`${TAG} TIMEOUT after ${timeout}ms — killing process`);
      try { command.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`${TAG} Transcoding timed out after ${timeout}ms`));
    }, timeout);

    const settle = (err, durationSec = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (err) {
        console.error(`${TAG} FAIL  error=${err.message}`);
        // Clean up partial output
        try { if (fs.existsSync(absOutput)) fs.unlinkSync(absOutput); } catch (_) {}
        reject(err);
      } else {
        const elapsedMs = Date.now() - startTime;
        console.log(`${TAG} OK  duration=${durationSec ?? 'unknown'}s  elapsed=${elapsedMs}ms  out=${absOutput}`);
        resolve({ outputPath: absOutput, durationSec });
      }
    };

    // ── fluent-ffmpeg event hooks ───────────────────────────────────────────
    command
      .on('start', (cmdLine) => {
        console.log(`${TAG} EXEC  ${cmdLine}`);
      })
      .on('codecData', (data) => {
        console.log(`${TAG} INPUT format=${data.format}  audio=${data.audio}`);
      })
      .on('progress', (p) => {
        // p.timemark = "00:00:02.50"
        if (p.timemark) {
          process.stdout.write(`\r${TAG} PROGRESS ${p.timemark}          `);
        }
      })
      .on('end', () => {
        process.stdout.write('\n'); // flush progress line
        // Extract duration from output file metadata
        ffmpeg.ffprobe(absOutput, (probeErr, metadata) => {
          const durationSec = metadata?.format?.duration ?? null;
          settle(null, durationSec ? parseFloat(durationSec.toFixed(2)) : null);
        });
      })
      .on('error', (err, stdout, stderr) => {
        process.stdout.write('\n');
        console.error(`${TAG} STDERR: ${stderr || ''}`);
        settle(err);
      });

    command.run();
  });
}

// ── Cleanup Helper ─────────────────────────────────────────────────────────────

/**
 * safeUnlink — delete a file without throwing.
 * Use after the transcoded buffer has been read by Baileys.
 */
function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`${TAG} CLEANUP deleted=${filePath}`);
    }
  } catch (err) {
    console.warn(`${TAG} CLEANUP failed for ${filePath}: ${err.message}`);
  }
}

module.exports = { transcodeToOpus, safeUnlink, TAG };
