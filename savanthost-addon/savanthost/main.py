import os
import sys
import asyncio
import logging
import signal
from typing import List, Dict

# Import local modules (reuse logic from custom component)
# Note: We need to adapt them slightly as they are now running standalone
from discovery import SavantDiscovery
from api import SavantClient
from auth import get_device_id, generate_address_code, validate_auth_code

# Setup logging
logging.basicConfig(level=logging.INFO)
_LOGGER = logging.getLogger("SavantHostAddon")

class SavantAddon:
    def __init__(self):
        self.auth_code = os.environ.get("AUTH_CODE", "")
        self.client = None
        self.loop = asyncio.get_event_loop()
        self.running = True

    async def start(self):
        _LOGGER.info("Starting SavantHost Add-on logic...")
        
        # 1. Verify Auth
        device_id = get_device_id()
        address_code = generate_address_code(device_id)
        
        _LOGGER.info(f"Device ID: {device_id}")
        _LOGGER.info(f"Address Code: {address_code}")
        
        if not validate_auth_code(address_code, self.auth_code):
            _LOGGER.error("Invalid Auth Code! Plugin will exit.")
            _LOGGER.error(f"Please use this Address Code to get a valid license: {address_code}")
            sys.exit(1)
            
        _LOGGER.info("Authorization successful!")

        # 2. Discover Host
        discovery = SavantDiscovery() # Need to adapt discovery.py to not depend on HA
        hosts = await discovery.discover()
        
        if not hosts:
            _LOGGER.error("No Savant Host found! Retrying in 30 seconds...")
            await asyncio.sleep(30)
            return await self.start()
            
        # Pick first host for now
        host = hosts[0]
        _LOGGER.info(f"Connected to Savant Host: {host['ip']}:{host['port']}")
        
        # 3. Initialize API Client
        # Standalone usage requires creating own session
        import aiohttp
        session = aiohttp.ClientSession()
        self.client = SavantClient(session, host["ip"], host["port"])
        
        # 4. Main Loop
        # Here we could expose a simple HTTP server to receive HA webhooks 
        # or just keep the connection alive if we were doing more than polling.
        # Since this is an Add-on, maybe we just log scenes for now?
        # Real integration usually happens via MQTT or HA API.
        
        while self.running:
            try:
                scenes = await self.client.get_scenes()
                _LOGGER.info(f"Synced {len(scenes)} scenes from host.")
                await asyncio.sleep(300) # 5 minutes
            except Exception as e:
                _LOGGER.error(f"Error in main loop: {e}")
                await asyncio.sleep(60)

    def stop(self):
        self.running = False

async def main():
    addon = SavantAddon()
    
    # Handle signals
    def handle_signal():
        addon.stop()
        
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, handle_signal)
    loop.add_signal_handler(signal.SIGINT, handle_signal)
    
    await addon.start()

if __name__ == "__main__":
    asyncio.run(main())
