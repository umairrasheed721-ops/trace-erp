#!/bin/bash
cd "$(dirname "$0")"
echo "🔌 Cleaning up any stuck port 9099 process..."
lsof -ti:9099 | xargs kill -9 2>/dev/null
cd helper-app
echo "🚀 Starting WhatsApp Local Helper Daemon..."
node server.js
