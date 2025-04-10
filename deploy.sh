#!/bin/bash

# Navigate to the project directory
cd /home/Beowulf

# Pull the latest code from GitHub
git pull

# Install any new dependencies
npm install

# Restart the bot using PM2
pm2 restart Beowulf

# Save the PM2 process list (so it will restart on server reboot)
pm2 save