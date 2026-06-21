#!/bin/bash
cd "$(dirname "$0")/helper-app"
echo "🔌 Starting WhatsApp Local Helper Daemon..."
npm install
npm start
