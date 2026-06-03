const fs = require('fs');
const path = require('path');
const { uploadToCloudinary } = require('../services/googleDrive');

console.log('⚡ --- CLOUDINARY UPLOAD STRESS TEST --- ⚡');
console.log('Starting parallel upload of 20 sample images...');

// 1x1 transparent PNG buffer
const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const buffer = Buffer.from(samplePngBase64, 'base64');

async function runTest() {
  const totalUploads = 20;
  const promises = [];
  const startTime = Date.now();

  for (let i = 1; i <= totalUploads; i++) {
    const fileName = `stress_test_sample_${i}.png`;
    const singleStart = Date.now();
    
    // Push the promise execution
    const uploadPromise = (async () => {
      try {
        console.log(`📤 [Upload #${i}] Starting upload of ${fileName}...`);
        const result = await uploadToCloudinary(buffer, fileName);
        const duration = Date.now() - singleStart;
        if (result && result.url) {
          console.log(`✅ [Upload #${i}] Successful in ${duration}ms | URL: ${result.url}`);
          return { index: i, success: true, duration, url: result.url };
        } else {
          console.error(`❌ [Upload #${i}] Failed (Returned null) in ${duration}ms`);
          return { index: i, success: false, duration, error: 'Returned null' };
        }
      } catch (err) {
        const duration = Date.now() - singleStart;
        console.error(`❌ [Upload #${i}] Unhandled Error in ${duration}ms: ${err.message}`);
        return { index: i, success: false, duration, error: err.message };
      }
    })();

    promises.push(uploadPromise);
  }

  const results = await Promise.all(promises);
  const totalDuration = Date.now() - startTime;

  console.log('\n📊 --- STRESS TEST REPORT --- 📊');
  console.log(`Total Parallel Uploads: ${totalUploads}`);
  console.log(`Total Duration: ${totalDuration}ms`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful Uploads: ${successful.length}`);
  console.log(`❌ Failed Uploads: ${failed.length}`);

  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    console.log(`⏱️ Average Successful Duration: ${avgDuration.toFixed(1)}ms`);
  }
}

// Load env variables if .env exists
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else {
    require('dotenv').config();
  }
} catch (e) {}

runTest().then(() => {
  console.log('🏁 Stress test script complete.');
});
