const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 9099;

// Keep-Alive connection pool for faster subsequent downloads
const axiosInstance = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 25, keepAliveMsecs: 1000 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 25, keepAliveMsecs: 1000 }),
  timeout: 10000 // 10s timeout
});


// Global dispatching flag to prioritize user dispatch network traffic
let isDispatching = false;

// Helper to generate md5 hash filename for caching
function getCachePath(url) {
  const urlHash = crypto.createHash('md5').update(url).digest('hex');
  let ext = '.png';
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const fileExt = path.extname(pathname);
    if (fileExt && fileExt.match(/^\.[a-zA-Z0-9]+$/)) {
      ext = fileExt;
    }
  } catch (e) {
    // fallback to .png
  }
  return path.join(__dirname, 'cache', `${urlHash}${ext}`);
}

// Helper to download multiple images to temp files, utilizing disk cache & downloading in parallel
async function downloadImages(urls, concurrency = 5) {
  const downloadedFiles = [];
  
  // Cleanup any old temp files first
  cleanTempFiles();

  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  isDispatching = true;
  console.log(`🚀 Dispatch started. Pausing background pre-fetching queue.`);

  try {
    const tasks = urls.map((url, index) => ({ url, index }));
    const total = urls.length;

    const worker = async () => {
      while (tasks.length > 0) {
        const task = tasks.shift();
        if (!task) break;
        const { url, index } = task;

        try {
          const cachePath = getCachePath(url);
          const ext = path.extname(cachePath);
          const tempPath = path.join(__dirname, `temp_img_${index}${ext}`);

          // Check if image is already cached
          let useCached = false;
          if (fs.existsSync(cachePath)) {
            const stats = fs.statSync(cachePath);
            if (stats.size > 0) {
              useCached = true;
            }
          }

          if (useCached) {
            console.log(`⚡ Cache Hit [${index + 1}/${total}]: ${url}`);
            fs.copyFileSync(cachePath, tempPath);
            downloadedFiles[index] = tempPath;
          } else {
            console.log(`🌐 Cache Miss [${index + 1}/${total}]. Downloading image...`);
            const response = await axiosInstance({
              url: url,
              method: 'GET',
              responseType: 'stream',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });

            await new Promise((resolve, reject) => {
              const writer = fs.createWriteStream(cachePath);
              response.data.pipe(writer);
              writer.on('finish', () => {
                fs.copyFileSync(cachePath, tempPath);
                downloadedFiles[index] = tempPath;
                resolve();
              });
              writer.on('error', (err) => {
                try { fs.unlinkSync(cachePath); } catch (e) {}
                reject(err);
              });
            });
            console.log(`✅ Cache Saved [${index + 1}/${total}]: ${url}`);
          }
        } catch (e) {
          console.error(`❌ Failed to process image at index ${index}:`, e.message);
        }
      }
    };

    // Run parallel workers
    const workers = Array(Math.min(concurrency, total)).fill(null).map(() => worker());
    await Promise.all(workers);

  } finally {
    isDispatching = false;
    console.log(`🏁 Dispatch complete. Resuming background pre-fetching queue.`);
    processPrefetchQueue();
  }

  return downloadedFiles.filter(Boolean);
}

// Clean old temporary files (handles any extension)
function cleanTempFiles() {
  try {
    const files = fs.readdirSync(__dirname);
    for (const file of files) {
      if (file.startsWith('temp_img_')) {
        fs.unlinkSync(path.join(__dirname, file));
      }
    }
  } catch (e) {
    console.error('Failed to cleanup temp images:', e.message);
  }
}


// OS-specific window focusing, clipboard image load, and paste trigger
function copyImagesToClipboardAndSend(filePaths) {
  const platform = process.platform;
  if (filePaths.length === 0) return;

  if (platform === 'darwin') {
    // macOS: Use Cocoa AppKit Framework via scripting additions to set NSPasteboard.
    // This allows copying multiple file URLs to the clipboard at once, so WhatsApp pastes them in one go.
    const fileAdditions = filePaths.map(fp => {
      const absolutePath = path.resolve(fp);
      return `fileURLs's addObject:(current application's NSURL's fileURLWithPath:"${absolutePath}")`;
    }).join('\n');

    const appleScript = `
      use framework "AppKit"
      use framework "Foundation"
      use scripting additions

      try
        set fileURLs to current application's NSMutableArray's array()
        ${fileAdditions}
        
        set pb to current application's NSPasteboard's generalPasteboard()
        pb's clearContents()
        pb's writeObjects:fileURLs
        
        delay 0.3
        tell application "System Events"
          set frontmost of process "WhatsApp" to true
          delay 0.5
          keystroke "v" using {command down}
        end tell
        delay 0.5
      on error errMsg
        log errMsg
      end try
    `;
    
    // Write AppleScript to a temp file and execute it to avoid string escape issues
    const scriptPath = path.join(__dirname, 'macro.scpt');
    fs.writeFileSync(scriptPath, appleScript, 'utf8');
    
    exec(`osascript "${scriptPath}"`, (err) => {
      if (err) console.error('AppleScript Execution Error:', err);
      // Clean up script
      try { fs.unlinkSync(scriptPath); } catch(e) {}
    });

  } else if (platform === 'win32') {
    // Windows PowerShell to copy multiple files to clipboard:
    const fileAdditions = filePaths.map(fp => `$FileArray.Add("${path.resolve(fp).replace(/\\/g, '\\\\')}")`).join('\n');
    
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $FileArray = New-Object System.Collections.Specialized.StringCollection
      ${fileAdditions}
      [System.Windows.Forms.Clipboard]::SetFileDropList($FileArray)
      
      Start-Sleep -Milliseconds 500
      $wshell = New-Object -ComObject Wscript.Shell
      
      $activated = $false
      # Try finding process by MainWindowTitle containing WhatsApp
      $proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*WhatsApp*" } | Select-Object -First 1
      if ($proc) {
        try {
          $activated = $wshell.AppActivate($proc.Id)
        } catch {}
      }
      
      # Fallback to Process Name
      if (-not $activated) {
        $proc = Get-Process | Where-Object { $_.ProcessName -eq "WhatsApp" } | Select-Object -First 1
        if ($proc) {
          try {
            $activated = $wshell.AppActivate($proc.Id)
          } catch {}
        }
      }
      
      # Fallback to direct title activation
      if (-not $activated) {
        try {
          $activated = $wshell.AppActivate("WhatsApp")
        } catch {}
      }
      
      # Sleep and send Ctrl+V
      Start-Sleep -Milliseconds 800
      $wshell.SendKeys("^v")
      Write-Host "Pasted to WhatsApp successfully."
    `;
    
    const scriptPath = path.join(__dirname, 'macro.ps1');
    fs.writeFileSync(scriptPath, psScript, 'utf8');
    
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, (err, stdout) => {
      if (err) console.error('PowerShell Execution Error:', err);
      console.log(stdout);
      // Clean up script
      try { fs.unlinkSync(scriptPath); } catch(e) {}
    });
  } else {
    console.error('Unsupported operating system platform:', platform);
  }
}

// End-point to proxy external images to the extension, avoiding CORS restrictions
app.get('/fetch-image', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }
  try {
    const response = await axios({
      url: url,
      method: 'GET',
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const contentType = response.headers['content-type'] || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.send(response.data);
  } catch (err) {
    console.error(`Failed to fetch/stream image: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Background prefetch worker queue
let prefetchQueue = [];
let isPrefetching = false;

async function processPrefetchQueue() {
  if (isPrefetching || prefetchQueue.length === 0) return;
  isPrefetching = true;

  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  while (prefetchQueue.length > 0) {
    // Yield network bandwidth to active send operation
    if (isDispatching) {
      console.log(`⏳ [Background Cache] Yielding network bandwidth to active sending...`);
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const url = prefetchQueue.shift();
    try {
      const cachePath = getCachePath(url);
      
      // If already cached, skip
      if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
        continue;
      }

      console.log(`⚡ [Background Cache] Downloading: ${url}`);
      const response = await axiosInstance({
        url: url,
        method: 'GET',
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(cachePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (err) => {
          try { fs.unlinkSync(cachePath); } catch (e) {}
          reject(err);
        });
      });
      
      // Sleep 200ms between downloads
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.warn(`⚠️ [Background Cache] Failed for ${url}: ${err.message}`);
    }
  }

  isPrefetching = false;
}

// Auto clean cache older than 30 days
function autoCleanCache() {
  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) return;
  
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  try {
    const files = fs.readdirSync(cacheDir);
    let cleanedCount = 0;
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > THIRTY_DAYS_MS) {
        fs.unlinkSync(filePath);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      console.log(`🧹 Cache Garbage Collector: Removed ${cleanedCount} cached images older than 30 days.`);
    } else {
      console.log(`🧹 Cache Garbage Collector: Cache is clean. No images older than 30 days.`);
    }
  } catch (err) {
    console.error('Failed to run cache clean:', err.message);
  }
}

// End-point called by ERP page
app.post('/paste-image', async (req, res) => {
  const { imageUrl, imageUrls } = req.body;
  
  // Accept either a single URL or an array of URLs
  const urls = Array.isArray(imageUrls) ? imageUrls : (imageUrl ? [imageUrl] : []);
  if (urls.length === 0) return res.status(400).json({ error: 'Image URL(s) required' });

  try {
    console.log(`📥 Downloading ${urls.length} images...`);
    const localFiles = await downloadImages(urls);
    
    if (localFiles.length === 0) {
      return res.status(400).json({ error: 'Failed to download any images' });
    }

    console.log(`📋 Copying ${localFiles.length} files to clipboard and triggering WhatsApp...`);
    copyImagesToClipboardAndSend(localFiles);

    res.json({ success: true, message: `${localFiles.length} images processed, copying to clipboard & sending...` });
  } catch (err) {
    console.error('Error processing image send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to pre-fetch/cache images in the background
app.post('/pre-fetch-images', (req, res) => {
  const { imageUrls } = req.body;
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: 'imageUrls array is required' });
  }

  imageUrls.forEach(url => {
    if (!prefetchQueue.includes(url)) {
      prefetchQueue.push(url);
    }
  });

  processPrefetchQueue();

  res.json({ success: true, message: `Queued ${imageUrls.length} images for background pre-fetching.` });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🔌 Trace WhatsApp Local Helper Daemon running on http://127.0.0.1:${PORT}`);
  // Ensure cache directory exists on startup
  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log('📁 Created missing cache directory on startup.');
  }
  // Run cache cleaner on startup
  autoCleanCache();
  // Run cache cleaner every 24 hours
  setInterval(autoCleanCache, 24 * 60 * 60 * 1000);
});

