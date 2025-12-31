#!/bin/zsh
SCRIPT_DIR=$(dirname $(readlink -f "$0"))
cd "$SCRIPT_DIR" 
cd /Users/rick/Documents/SavantHost/homebridge-savanthost
npm run build
sleep 5
node dist/auth-generator.js