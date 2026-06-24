const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 9099;

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

// Helper to download multiple images to temp files, utilizing disk cache
async function downloadImages(urls) {
  const downloadedFiles = [];
  
  // Cleanup any old temp files first
  cleanTempFiles();

  const cacheDir = path.join(__dirname, 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const cachePath = getCachePath(url);
      const ext = path.extname(cachePath);
      const tempPath = path.join(__dirname, `temp_img_${i}${ext}`);

      // Check if image is already cached
      let useCached = false;
      if (fs.existsSync(cachePath)) {
        const stats = fs.statSync(cachePath);
        if (stats.size > 0) {
          useCached = true;
        }
      }

      if (useCached) {
        console.log(`⚡ Cache Hit for image ${i + 1}/${urls.length}: ${url}`);
        fs.copyFileSync(cachePath, tempPath);
        downloadedFiles.push(tempPath);
      } else {
        console.log(`🌐 Cache Miss. Downloading image ${i + 1}/${urls.length}: ${url}`);
        const response = await axios({
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
            downloadedFiles.push(tempPath);
            resolve();
          });
          writer.on('error', (err) => {
            try { fs.unlinkSync(cachePath); } catch (e) {}
            reject(err);
          });
        });
      }
    } catch (e) {
      console.error(`Failed to process image at index ${i}:`, e.message);
    }
  }
  return downloadedFiles;
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
    // macOS: Copy each file as TIFF picture data to clipboard and paste sequentially.
    // Pasting subsequent images in WhatsApp Desktop adds them to the media group.
    let scriptActions = '';
    for (let i = 0; i < filePaths.length; i++) {
      const absolutePath = path.resolve(filePaths[i]);
      scriptActions += `
        try
          set the clipboard to (read (POSIX file "${absolutePath}") as TIFF picture)
          delay 0.3
          tell application "System Events"
            keystroke "v" using {command down}
          end tell
          delay 0.6
        on error errMsg
          log errMsg
        end try
      `;
    }

    const appleScript = `
      try
        tell application "System Events"
          set frontmost of process "WhatsApp" to true
          delay 0.5
        end tell
        ${scriptActions}
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
      $activated = $wshell.AppActivate("WhatsApp")
      if ($activated) {
        Start-Sleep -Milliseconds 800
        $wshell.SendKeys("^v")
      } else {
        Write-Host "WhatsApp window not found."
      }
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🔌 Trace WhatsApp Local Helper Daemon running on http://127.0.0.1:${PORT}`);
});
