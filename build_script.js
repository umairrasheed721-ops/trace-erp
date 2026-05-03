const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  console.log(`🚀 Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    console.error(`❌ Command Failed: ${cmd}`);
    console.error(e.message);
    process.exit(1);
  }
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('🏗️ --- TRACE ERP ROBUST BUILD ENGINE --- 🏗️');

// 1. Build Frontend
console.log('✨ Compiling Frontend Assets (Vite)...');
process.env.NODE_OPTIONS = '--max-old-space-size=1024';
run('cd frontend && npx --yes vite build');

// 3. Verify Dist
const distPath = path.join(__dirname, 'frontend', 'dist');
if (!fs.existsSync(distPath)) {
  console.error('❌ CRITICAL ERROR: frontend/dist was not created!');
  process.exit(1);
}

const distItems = fs.readdirSync(distPath);
console.log(`📂 Compiled Assets Found: ${distItems.join(', ')}`);

// 4. Relocate to Backend
const publicPath = path.join(__dirname, 'backend', 'public');
console.log(`🚚 Relocating assets to: ${publicPath}`);

if (fs.existsSync(publicPath)) {
  console.log('🧹 Purging old public directory...');
  fs.rmSync(publicPath, { recursive: true, force: true });
}
fs.mkdirSync(publicPath, { recursive: true });

console.log('📤 Copying build artifacts...');
copyRecursiveSync(distPath, publicPath);

// 5. Final Sanity Check
const finalAssetsPath = path.join(publicPath, 'assets');
if (fs.existsSync(finalAssetsPath)) {
  const assetCount = fs.readdirSync(finalAssetsPath).length;
  console.log(`✅ Success! Relocated ${assetCount} assets to production public folder.`);
} else {
  console.error('❌ WARNING: Assets folder missing in public directory!');
}

console.log('🏁 Build Protocol Complete.');
