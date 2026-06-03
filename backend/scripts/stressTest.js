/**
 * stressTest.js – Post-Optimization Stress Test
 * Tests the updated Cloudinary pipeline with:
 *   ✅ p-queue concurrency limit (max 3)
 *   ✅ Buffer→Readable streaming path
 *   ✅ Memory snapshots every 2 s
 *   ✅ Per-upload timestamps to verify queue throttle
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// ─── Load .env ───────────────────────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else {
    require('dotenv').config();
  }
} catch (e) {}

const { uploadToCloudinary } = require('../services/googleDrive');

// ─── Sample Payload ───────────────────────────────────────────────────────────
// 1×1 transparent PNG (tiny, but exercises the full upload code path)
const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const sampleBuffer = Buffer.from(SAMPLE_PNG_B64, 'base64');

// ─── Memory Monitor ──────────────────────────────────────────────────────────
let peakHeapMB = 0;
const memInterval = setInterval(() => {
  const { heapUsed, rss } = process.memoryUsage();
  const heapMB = (heapUsed / 1024 / 1024).toFixed(1);
  const rssMB  = (rss  / 1024 / 1024).toFixed(1);
  if (parseFloat(heapMB) > peakHeapMB) peakHeapMB = parseFloat(heapMB);
  console.log(`🧠 [Memory] Heap: ${heapMB} MB | RSS: ${rssMB} MB`);
}, 2000);

// ─── Queue Init ───────────────────────────────────────────────────────────────
const TOTAL_UPLOADS  = 20;
const CONCURRENCY    = 3;

console.log('⚡ ─────────────────────────────────────────────────');
console.log('⚡  CLOUDINARY STRESS TEST  –  Post-Optimization Run');
console.log('⚡ ─────────────────────────────────────────────────');
console.log(`📋 Total uploads   : ${TOTAL_UPLOADS}`);
console.log(`🔁 Max concurrency : ${CONCURRENCY} (p-queue)`);
console.log(`📦 Payload         : Buffer→Readable stream (~68 bytes PNG)`);
console.log('⚡ ─────────────────────────────────────────────────\n');

async function runTest() {
  // Import p-queue (ESM-only)
  let PQueue;
  try {
    const mod = await import('p-queue');
    PQueue = mod.default;
  } catch (err) {
    console.error('❌ Could not import p-queue:', err.message);
    console.error('   Run: npm install p-queue  inside backend/');
    process.exit(1);
  }

  const queue = new PQueue({ concurrency: CONCURRENCY });

  const globalStart = Date.now();
  const results     = [];
  let   activeCount = 0;  // live tracker to verify ≤3 at once

  // Track concurrency watermark
  let maxObservedConcurrency = 0;

  const tasks = Array.from({ length: TOTAL_UPLOADS }, (_, idx) => {
    const i        = idx + 1;
    const fileName = `stress_optimized_${i}.png`;

    return queue.add(async () => {
      activeCount++;
      if (activeCount > maxObservedConcurrency) maxObservedConcurrency = activeCount;

      const queuedAt = Date.now() - globalStart;
      const start    = Date.now();

      console.log(
        `📤 [#${String(i).padStart(2)}] START  | active=${activeCount}/${CONCURRENCY}` +
        ` | queued_at=${queuedAt}ms`
      );

      let success = false;
      let url     = null;
      let error   = null;

      try {
        // Use a fresh Readable stream for each upload (mimics the streaming
        // path from Baileys; the Cloudinary service accepts both Buffer and
        // Readable thanks to our refactor).
        const readableStream = Readable.from(sampleBuffer);
        const result = await uploadToCloudinary(readableStream, fileName);

        if (result && result.url) {
          success = true;
          url     = result.url;
        } else {
          error = 'uploadToCloudinary returned null';
        }
      } catch (err) {
        error = err.message;
      }

      const duration = Date.now() - start;
      activeCount--;

      if (success) {
        console.log(`✅ [#${String(i).padStart(2)}] DONE   | ${duration}ms | active_after=${activeCount}`);
      } else {
        console.error(`❌ [#${String(i).padStart(2)}] FAIL   | ${duration}ms | reason=${error}`);
      }

      results.push({ index: i, success, duration, url, error });
    });
  });

  await Promise.all(tasks);

  clearInterval(memInterval);

  const totalDuration = Date.now() - globalStart;
  const successful    = results.filter(r => r.success);
  const failed        = results.filter(r => !r.success);
  const avgDuration   = successful.length
    ? (successful.reduce((s, r) => s + r.duration, 0) / successful.length).toFixed(1)
    : 'N/A';
  const minDuration   = successful.length ? Math.min(...successful.map(r => r.duration)) : 'N/A';
  const maxDuration   = successful.length ? Math.max(...successful.map(r => r.duration)) : 'N/A';

  console.log('\n📊 ─────────────────────────────────────────────────');
  console.log('📊  STRESS TEST REPORT  –  Post-Optimization');
  console.log('📊 ─────────────────────────────────────────────────');
  console.log(`Total Uploads         : ${TOTAL_UPLOADS}`);
  console.log(`Total Wall-Clock Time : ${totalDuration}ms`);
  console.log(`✅ Successful          : ${successful.length}`);
  console.log(`❌ Failed              : ${failed.length}`);
  console.log(`⏱️  Avg Upload Duration : ${avgDuration}ms`);
  console.log(`⏱️  Min Upload Duration : ${minDuration}ms`);
  console.log(`⏱️  Max Upload Duration : ${maxDuration}ms`);
  console.log(`🔁 Max Observed Concurrency : ${maxObservedConcurrency} (limit=${CONCURRENCY})`);
  console.log(`🧠 Peak Heap Usage    : ${peakHeapMB} MB`);

  if (failed.length > 0) {
    console.log('\n🔴 Failed Upload Details:');
    failed.forEach(r => console.error(`   [#${r.index}] ${r.error}`));
  }

  console.log('📊 ─────────────────────────────────────────────────\n');

  return { totalDuration, successful: successful.length, failed: failed.length, avgDuration, minDuration, maxDuration, maxObservedConcurrency, peakHeapMB };
}

runTest()
  .then(summary => {
    // Machine-readable summary for audit report generation
    console.log('🏁 MACHINE_SUMMARY:', JSON.stringify(summary));
    console.log('🏁 Stress test complete.');
  })
  .catch(err => {
    clearInterval(memInterval);
    console.error('💥 Stress test crashed:', err);
    process.exit(1);
  });
