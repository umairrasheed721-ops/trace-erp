const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 9099;

// Helper to download image to temp file
async function downloadImage(url) {
  const tempPath = path.join(__dirname, 'temp_img.png');
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);
    writer.on('finish', () => resolve(tempPath));
    writer.on('error', reject);
  });
}

// OS-specific window focusing, clipboard image load, and paste trigger
function copyImageToClipboardAndSend(filePath) {
  const platform = process.platform;
  const absolutePath = path.resolve(filePath);

  if (platform === 'darwin') {
    // macOS AppleScript:
    // 1. Reads image file and writes to clipboard as TIFF
    // 2. Activates WhatsApp Desktop app
    // 3. Simulates Command+V then Enter
    const appleScript = `
      set imagePath to "${absolutePath}"
      try
        set the clipboard to (read (POSIX file imagePath) as TIFF picture)
        delay 0.5
        tell application "System Events"
          set frontmost of process "WhatsApp" to true
          delay 0.5
          keystroke "v" using {command down}
          delay 0.8
          key code 36 -- Enter key
        end tell
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
    // Windows PowerShell script:
    // 1. Loads .NET drawing assembly, reads the file, sets to clipboard
    // 2. Activates WhatsApp Desktop app window
    // 3. Simulates Ctrl+V then Enter
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $image = [System.Drawing.Image]::FromFile("${absolutePath.replace(/\\/g, '\\\\')}")
      [System.Windows.Forms.Clipboard]::SetImage($image)
      $image.Dispose()
      
      Start-Sleep -Milliseconds 500
      $wshell = New-Object -ComObject Wscript.Shell
      $activated = $wshell.AppActivate("WhatsApp")
      if ($activated) {
        Start-Sleep -Milliseconds 800
        $wshell.SendKeys("^v")
        Start-Sleep -Milliseconds 800
        $wshell.SendKeys("{ENTER}")
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

// End-point called by ERP page
app.post('/paste-image', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'Image URL required' });

  try {
    console.log(`📥 Downloading image: ${imageUrl}`);
    const localFile = await downloadImage(imageUrl);
    
    console.log('📋 Copying to clipboard and triggering focus/paste on WhatsApp...');
    copyImageToClipboardAndSend(localFile);

    res.json({ success: true, message: 'Image download initiated, copying to clipboard & sending...' });
  } catch (err) {
    console.error('Error processing image send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🔌 Trace WhatsApp Local Helper Daemon running on http://127.0.0.1:${PORT}`);
});
