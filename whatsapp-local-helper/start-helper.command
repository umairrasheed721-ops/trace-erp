#!/bin/bash
cd "$(dirname "$0")"
echo "🔄 Checking for updates from GitHub..."
git pull
cd helper-app
echo "🔌 Starting WhatsApp Local Helper Daemon..."
npm install
npm start
