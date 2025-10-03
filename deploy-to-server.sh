#!/bin/bash
# Deploy script for OracleAPI to DigitalOcean server
# Usage: Run this on your server via SSH

echo "🚀 Starting deployment..."

# Navigate to project directory
cd /root/OracleAPI || { echo "❌ Directory not found"; exit 1; }

# Pull latest changes
echo "📥 Pulling latest code from GitHub..."
git pull origin master

# Install dependencies (if package.json changed)
echo "📦 Installing dependencies..."
npm install

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Restart the API server with PM2
echo "🔄 Restarting API server..."
pm2 describe oracle-api > /dev/null 2>&1
if [ $? -eq 0 ]; then
    # App exists, restart it
    pm2 restart oracle-api
else
    # App doesn't exist, start it
    pm2 start server.js --name oracle-api
    pm2 save
fi

# Show status
pm2 list
pm2 logs oracle-api --lines 20

echo "✅ Deployment complete!"
echo ""
echo "📊 Useful commands:"
echo "  pm2 logs oracle-api          - View real-time logs"
echo "  pm2 restart oracle-api        - Restart the server"
echo "  pm2 stop oracle-api           - Stop the server"
echo "  pm2 status                    - Check server status"
