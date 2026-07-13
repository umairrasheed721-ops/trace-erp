@echo off
cd /d "%~dp0"
echo 🔄 Checking for updates from GitHub...
git pull
cd helper-app
echo 🔌 Starting WhatsApp Local Helper Daemon...
npm install
npm start
pause
