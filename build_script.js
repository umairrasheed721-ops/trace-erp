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

// 0. Backend Syntax Guard (Safety Layer)
console.log('🛡️ Running Backend Syntax Guard...');
run('node backend_check.js');

// 1. Build Frontend
console.log('✨ Compiling Frontend Assets (Vite)...');
process.env.NODE_OPTIONS = '--max-old-space-size=1024';
try {
  run('cd frontend && npx vite build');
} catch (err) {
  console.warn('⚠️ Frontend compilation step warning:', err.message);
  console.log('ℹ️ Proceeding with pre-compiled assets in backend/public...');
}

// 3. Verify Dist
const distPath = path.join(__dirname, 'frontend', 'dist');
if (!fs.existsSync(distPath)) {
  console.error('❌ CRITICAL ERROR: frontend/dist was not created!');
  process.exit(1);
}

const distItems = fs.readdirSync(distPath);
console.log(`📂 Compiled Assets Found: ${distItems.join(', ')}`);

// 4. Relocate to Backend (preserve existing theme ZIP if running where ../trace-dynamic-theme.zip isn't present)
const publicPath = path.join(__dirname, 'backend', 'public');
const existingThemeZipBackup = path.join(__dirname, '.tmp_theme_zip_backup.zip');
const existingThemeMetaBackup = path.join(__dirname, '.tmp_theme_meta_backup.json');
const prevThemeZip = path.join(publicPath, 'downloads', 'trace-dynamic-theme.zip');
const prevThemeMeta = path.join(publicPath, 'downloads', 'theme-meta.json');
if (fs.existsSync(prevThemeZip)) fs.copyFileSync(prevThemeZip, existingThemeZipBackup);
if (fs.existsSync(prevThemeMeta)) fs.copyFileSync(prevThemeMeta, existingThemeMetaBackup);

console.log(`🚚 Relocating assets to: ${publicPath}`);

if (fs.existsSync(publicPath)) {
  console.log('🧹 Purging old public directory...');
  fs.rmSync(publicPath, { recursive: true, force: true });
}
fs.mkdirSync(publicPath, { recursive: true });

console.log('📤 Copying build artifacts...');
copyRecursiveSync(distPath, publicPath);

// 4.5. Generate version metadata for automated client-side cache busting
const versionInfo = { buildId: `build-${Date.now()}` };
fs.writeFileSync(path.join(publicPath, 'version.json'), JSON.stringify(versionInfo, null, 2), 'utf8');
console.log(`✨ Generated version metadata with buildId: ${versionInfo.buildId}`);

// 4.6. Auto-package Chrome Extension ZIP into backend/public/downloads/ for 1-click multi-laptop install
const extSourceDir = path.join(__dirname, 'shopify-cs-tagger-extension');
const extManifestPath = path.join(extSourceDir, 'manifest.json');
if (fs.existsSync(extManifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(extManifestPath, 'utf8'));
    const extVersion = manifest.version || '1.0.0';
    const extName = manifest.name || 'Trace ERP Chrome Extension';
    const extDesc = manifest.description || '';
    const downloadsDir = path.join(publicPath, 'downloads');
    fs.mkdirSync(downloadsDir, { recursive: true });

    const folderSlug = `trace-erp-extension-v${extVersion}`;
    const versionedFilename = `${folderSlug}.zip`;
    const versionedZipPath = path.join(downloadsDir, versionedFilename);
    const latestZipPath = path.join(downloadsDir, 'trace-erp-extension-latest.zip');

    // Stage clean copy without macOS junk (.DS_Store) inside a clean top-level folder
    const tmpStageRoot = path.join(__dirname, '.tmp_ext_stage');
    const tmpStageFolder = path.join(tmpStageRoot, folderSlug);
    if (fs.existsSync(tmpStageRoot)) fs.rmSync(tmpStageRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpStageFolder, { recursive: true });

    const bundledFiles = [];
    for (const entry of fs.readdirSync(extSourceDir)) {
      if (entry === '.DS_Store' || entry.startsWith('._')) continue;
      const srcFile = path.join(extSourceDir, entry);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, path.join(tmpStageFolder, entry));
        bundledFiles.push(entry);
      }
    }

    execSync(`cd "${tmpStageRoot}" && zip -rq "${versionedZipPath}" "${folderSlug}"`, { stdio: 'pipe' });
    fs.copyFileSync(versionedZipPath, latestZipPath);
    fs.rmSync(tmpStageRoot, { recursive: true, force: true });

    const zipStat = fs.statSync(versionedZipPath);
    const extMeta = {
      name: extName,
      version: extVersion,
      description: extDesc,
      filename: versionedFilename,
      downloadUrl: `/downloads/${versionedFilename}`,
      latestUrl: '/downloads/trace-erp-extension-latest.zip',
      sizeBytes: zipStat.size,
      fileCount: bundledFiles.length,
      files: bundledFiles.sort(),
      hostPermissions: manifest.host_permissions || [],
      builtAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(downloadsDir, 'extension-meta.json'), JSON.stringify(extMeta, null, 2), 'utf8');
    console.log(`🧩 Packaged Chrome Extension v${extVersion} (${zipStat.size} bytes) -> /downloads/${versionedFilename}`);
  } catch (extErr) {
    console.warn('⚠️ Failed to package Chrome Extension ZIP:', extErr.message);
  }
}

// 4.7. Sync Master Sanitized Shopify Theme ZIP into backend/public/downloads/ for 1-click multi-laptop download
const masterThemeZipSrc = path.resolve(__dirname, '..', 'trace-dynamic-theme.zip');
const downloadsDirTheme = path.join(publicPath, 'downloads');
fs.mkdirSync(downloadsDirTheme, { recursive: true });
const destThemeZip = path.join(downloadsDirTheme, 'trace-dynamic-theme.zip');
const destThemeMeta = path.join(downloadsDirTheme, 'theme-meta.json');

if (fs.existsSync(masterThemeZipSrc)) {
  try {
    fs.copyFileSync(masterThemeZipSrc, destThemeZip);
    const stat = fs.statSync(destThemeZip);
    let fileCount = 0;
    try {
      const listOut = execSync(`unzip -Z1 "${destThemeZip}"`, { stdio: 'pipe' }).toString();
      fileCount = listOut.split('\n').filter(Boolean).length;
    } catch (_) {}

    const themeMeta = {
      name: 'Trace Dynamic Shopify Theme (Sanitized Master)',
      filename: 'trace-dynamic-theme.zip',
      downloadUrl: '/downloads/trace-dynamic-theme.zip',
      sizeBytes: stat.size,
      fileCount,
      sanitized: true,
      updatedAt: stat.mtime.toISOString(),
      builtAt: new Date().toISOString(),
    };
    fs.writeFileSync(destThemeMeta, JSON.stringify(themeMeta, null, 2), 'utf8');
    console.log(`🎨 Synced Master Theme ZIP (${(stat.size / (1024 * 1024)).toFixed(2)} MB, ${fileCount} files) -> /downloads/trace-dynamic-theme.zip`);
  } catch (themeErr) {
    console.warn('⚠️ Failed to sync Master Theme ZIP:', themeErr.message);
  }
} else if (fs.existsSync(existingThemeZipBackup)) {
  fs.copyFileSync(existingThemeZipBackup, destThemeZip);
  if (fs.existsSync(existingThemeMetaBackup)) fs.copyFileSync(existingThemeMetaBackup, destThemeMeta);
  console.log('🎨 Preserved pre-bundled Master Theme ZIP in /downloads/trace-dynamic-theme.zip');
}
if (fs.existsSync(existingThemeZipBackup)) fs.unlinkSync(existingThemeZipBackup);
if (fs.existsSync(existingThemeMetaBackup)) fs.unlinkSync(existingThemeMetaBackup);

// 5. Final Sanity Check
const finalAssetsPath = path.join(publicPath, 'assets');
if (fs.existsSync(finalAssetsPath)) {
  const assetCount = fs.readdirSync(finalAssetsPath).length;
  console.log(`✅ Success! Relocated ${assetCount} assets to production public folder.`);
} else {
  console.error('❌ WARNING: Assets folder missing in public directory!');
}

console.log('🏁 Build Protocol Complete.');
