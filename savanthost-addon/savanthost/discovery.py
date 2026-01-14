import logging
import asyncio
from typing import List, Dict, Optional
from zeroconf import Zeroconf, ServiceBrowser, ServiceStateChange, ServiceInfo

_LOGGER = logging.getLogger(__name__)

class SavantDiscovery:
    """Helper to discover Savant hosts using Zeroconf (Standalone version)."""

    def __init__(self):
        self.found_hosts: List[Dict] = []
        self._zeroconf = Zeroconf()
        self._browser = None

    def _on_service_state_change(
        self, zeroconf: Zeroconf, service_type: str, name: str, state_change: ServiceStateChange
    ) -> None:
        """Callback for service state changes."""
        if state_change is ServiceStateChange.Added:
            info = zeroconf.get_service_info(service_type, name)
            if info:
                self._process_service_info(info)

    def _process_service_info(self, info: ServiceInfo) -> None:
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
        
        self._browser = ServiceBrowser(
            self._zeroconf, service_type, handlers=[self._on_service_state_change]
        )

        # Wait for discovery
        await asyncio.sleep(timeout)
        
        self._browser.cancel()
        self._zeroconf.close()
        
        return self.found_hosts
