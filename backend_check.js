const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      if (file !== 'node_modules' && file !== 'public') {
        arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
      }
    } else {
      if (file.endsWith('.js')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

console.log('🔍 --- BACKEND SYNTAX GUARD: PRE-FLIGHT CHECK --- 🔍');
const backendDir = path.join(__dirname, 'backend');
const files = getAllFiles(backendDir);
let errors = 0;

files.forEach(file => {
  try {
    // node --check <file> verifies syntax without executing
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`❌ SYNTAX ERROR FOUND IN: ${file}`);
    console.error(e.stderr.toString());
    errors++;
  }
});

if (errors > 0) {
  console.error(`\n🚨 CRITICAL: ${errors} syntax errors found! Build aborted.`);
  console.error('The server would have crashed if this was deployed.');
  process.exit(1);
} else {
  console.log(`✅ All ${files.length} backend files passed syntax verification.`);
}
