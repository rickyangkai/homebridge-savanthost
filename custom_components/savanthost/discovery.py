import logging
import asyncio
from typing import List, Dict, Optional
from homeassistant.core import HomeAssistant
from homeassistant.components import zeroconf

_LOGGER = logging.getLogger(__name__)

class SavantDiscovery:
    """Helper to discover Savant hosts using Zeroconf."""

    def __init__(self, hass: HomeAssistant):
        self.hass = hass
        self.found_hosts: List[Dict] = []
        self._browser = None

    def _process_service_info(self, info) -> None:
        """Process discovered service info."""
        if not info.addresses:
            return

        # Prefer IPv4
        ip = None
        for addr in info.addresses:
            # simple check for IPv4 (4 bytes)
            if len(addr) == 4:
                ip = ".".join(map(str, addr))
                break
        
        if not ip:
            return

        host_entry = {
            "ip": ip,
            "port": info.port,
            "name": info.name,
            "hostname": info.server,
        }
        
        # Check if already exists
        if not any(h["ip"] == ip for h in self.found_hosts):
            _LOGGER.info(f"Discovered Savant Host: {host_entry}")
            self.found_hosts.append(host_entry)

    async def discover(self, timeout: int = 5) -> List[Dict]:
        """Run discovery for a specified timeout."""
        self.found_hosts = []
        service_type = "_soapi_sdo._tcp.local."
        
        # Get shared zeroconf instance
        zc = await zeroconf.async_get_instance(self.hass)
        
        # In HA, we can just query the cache directly or use async_service_info
        # But a browser is more robust to find *new* things.
        # However, HA's shared zeroconf is already browsing commonly.
        # Let's check if HA zeroconf helper has a better way.
        # Usually, we register a listener.
        
        def on_service_state_change(zeroconf_obj, service_type, name, state_change):
            if state_change is zeroconf.ServiceStateChange.Added:
                info = zeroconf_obj.get_service_info(service_type, name)
                if info:
                    self._process_service_info(info)

        self._browser = zeroconf.ServiceBrowser(
            zc, service_type, handlers=[on_service_state_change]
        )

        # Wait for discovery
        await asyncio.sleep(timeout)
        
        # We should strictly NOT close the shared zeroconf instance
        self._browser.cancel()
        
        return self.found_hosts
