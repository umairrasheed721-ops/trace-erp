const fs = require('fs');
const path = require('path');
const vm = require('vm');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        if (file !== 'node_modules' && file !== 'public' && file !== 'wa_session' && !file.startsWith('.')) {
          arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        }
      } else {
        if (file.endsWith('.js')) {
          arrayOfFiles.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore files that disappeared or broken symlinks during scan
    }
  });

  return arrayOfFiles;
}

console.log('🔍 --- BACKEND SYNTAX GUARD: PRE-FLIGHT CHECK --- 🔍');
const startTime = Date.now();
const backendDir = path.join(__dirname, 'backend');
const files = getAllFiles(backendDir);
let errors = 0;

files.forEach(file => {
  try {
    const code = fs.readFileSync(file, 'utf8');
    new vm.Script(code, { filename: file });
  } catch (e) {
    console.error(`❌ SYNTAX ERROR FOUND IN: ${file}`);
    console.error(e.stack || e.message);
    errors++;
  }
});

const elapsed = Date.now() - startTime;
if (errors > 0) {
  console.error(`\n🚨 CRITICAL: ${errors} syntax errors found! Build aborted.`);
  console.error('The server would have crashed if this was deployed.');
  process.exit(1);
} else {
  console.log(`✅ All ${files.length} backend files passed syntax verification in ${elapsed}ms.`);
}
