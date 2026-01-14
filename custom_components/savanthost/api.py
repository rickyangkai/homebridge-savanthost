import logging
import aiohttp
import asyncio
from typing import List, Dict, Optional

_LOGGER = logging.getLogger(__name__)

class SavantClient:
    """Client to communicate with Savant Host."""

    def __init__(self, session: aiohttp.ClientSession, host: str, port: int):
        self.session = session
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"

    async def get_scenes(self) -> List[Dict]:
        """Fetch scenes from the host."""
        url = f"{self.base_url}/config/v1/scenes"
        try:
            async with self.session.get(url, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    if isinstance(data, list):
                        # Filter valid scenes
                        return [
                            {
                                "id": s.get("id"),
                                "name": s.get("alias") or s.get("name") or "Unknown"
                            }
                            for s in data
                            if s.get("id")
                        ]
                else:
                    _LOGGER.error(f"Failed to fetch scenes. Status: {response.status}")
        except Exception as e:
            _LOGGER.error(f"Error fetching scenes: {e}")
        return []

    async def activate_scene(self, scene_id: str) -> bool:
        """Activate a scene."""
        # URL matched from platform.ts fix: /control/v1/scenes/{sceneId}/apply
        url = f"{self.base_url}/control/v1/scenes/{scene_id}/apply"
        try:
            async with self.session.post(url, json={}, timeout=10) as response:
                if response.status == 200:
                    _LOGGER.info(f"Successfully activated scene {scene_id}")
                    return True
                else:
                    _LOGGER.error(f"Failed to activate scene {scene_id}. Status: {response.status}")
        except Exception as e:
            _LOGGER.error(f"Error activating scene: {e}")
        return False
