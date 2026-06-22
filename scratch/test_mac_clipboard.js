const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const file1 = '/Users/umairrasheed/Desktop/antigravity/trace-erp/impulse.jpg';
const file2 = '/Users/umairrasheed/Desktop/antigravity/trace-erp/layout.jpg';

const appleScript = `
  set f1 to (POSIX file "${file1}") as «class furl»
  set f2 to (POSIX file "${file2}") as «class furl»
  set the clipboard to {f1, f2}
  
  tell application "System Events"
    set frontmost of process "WhatsApp" to true
    delay 0.5
    keystroke "v" using {command down}
  end tell
`;

const scriptPath = path.join(__dirname, 'test_clip.scpt');
fs.writeFileSync(scriptPath, appleScript, 'utf8');

exec(`osascript "${scriptPath}"`, (err, stdout, stderr) => {
  if (err) {
    console.error('Error running AppleScript:', err);
    console.error('Stderr:', stderr);
  } else {
    console.log('Clipboard set and paste triggered. Check WhatsApp!');
  }
  fs.unlinkSync(scriptPath);
});
