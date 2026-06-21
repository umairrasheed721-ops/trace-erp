@echo off
cd /d "%~dp0\helper-app"
echo 🔌 Starting WhatsApp Local Helper Daemon...
npm install
npm start
pause
