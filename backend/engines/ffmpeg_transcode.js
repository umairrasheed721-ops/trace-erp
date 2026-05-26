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
 */

const ffmpeg      = require('fluent-ffmpeg');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const crypto      = require('crypto');

// ── Constants ────────────────────────────────────────────────────────────────
const TIMEOUT_MS  = 20_000;   // Hard kill after 20 s
const TAG         = '[FFMPEG_ENCODE]';
const SAMPLE_RATE = 48000;
const BITRATE     = '16k';
const CHANNELS    = 1;

// ── Concurrency Limiter Semaphore ────────────────────────────────────────────
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next();
    }
  }
}

// Strict maximum of 3 concurrent FFmpeg processes to prevent CPU starvation (Pillar 2)
const transcodeLimiter = new Semaphore(3);

function resolveOutputPath(inputPath) {
  const stem = path.basename(inputPath, path.extname(inputPath));
  // Safe temporary storage: always write to os.tmpdir() with UUID suffix to prevent name collision or pollution
  return path.join(os.tmpdir(), `${stem}_opus_${crypto.randomUUID()}.ogg`);
}

// ── Core Transcoder ───────────────────────────────────────────────────────────

async function transcodeToOpus(inputPath, opts = {}) {
  const absInput = path.resolve(inputPath);
  const absOutput = opts.outputPath || resolveOutputPath(absInput);
  const timeout   = opts.timeoutMs  || TIMEOUT_MS;

  const startTime = Date.now();
  console.log(`${TAG} START  input=${absInput}  output=${absOutput}`);

  // Acquire concurrency token asynchronously (Pillar 2 compliant, does not block event loop)
  await transcodeLimiter.acquire();
  console.log(`${TAG} ACQUIRED slot. Active processes: ${transcodeLimiter.current}/${transcodeLimiter.max}`);

  try {
    return await new Promise((resolve, reject) => {
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
          '-vbr on',                // Variable bitrate
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
          // Clean up partial output asynchronously to prevent directory pollution
          const fsPromises = require('fs').promises;
          fsPromises.unlink(absOutput).catch(() => {});
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
          if (p.timemark) {
            process.stdout.write(`\r${TAG} PROGRESS ${p.timemark}          `);
          }
        })
        .on('end', () => {
          process.stdout.write('\n'); // flush progress line
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
  } finally {
    // Release concurrency token in all cases
    transcodeLimiter.release();
    console.log(`${TAG} RELEASED slot. Active processes: ${transcodeLimiter.current}/${transcodeLimiter.max}`);
  }
}

// ── Cleanup Helper ─────────────────────────────────────────────────────────────

async function safeUnlink(filePath) {
  const fsPromises = require('fs').promises;
  try {
    if (filePath) {
      await fsPromises.unlink(filePath);
      console.log(`${TAG} CLEANUP deleted=${filePath}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`${TAG} CLEANUP failed for ${filePath}: ${err.message}`);
    }
  }
}

module.exports = { transcodeToOpus, safeUnlink, TAG };
