#!/usr/bin/with-contenv bashio

echo "Starting SavantHost Add-on..."

# Check auth code
AUTH_CODE=$(bashio::config 'auth_code')

if [ -z "$AUTH_CODE" ]; then
    bashio::log.error "Auth Code is missing! Please configure it in the Add-on configuration tab."
    exit 1
fi

export AUTH_CODE

# Start python script
python3 /main.py
