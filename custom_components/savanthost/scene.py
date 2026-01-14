import logging
from typing import Any

from homeassistant.components.scene import Scene
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Savant scenes."""
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator = data["coordinator"]
    client = data["client"]

    # Create entities from coordinator data
    current_scenes = coordinator.data or []
    entities = []
    
    for scene_info in current_scenes:
        entities.append(SavantSceneEntity(coordinator, client, scene_info))

    async_add_entities(entities)

class SavantSceneEntity(CoordinatorEntity, Scene):
    """Representation of a Savant Scene."""

    def __init__(self, coordinator, client, scene_info):
        """Initialize the scene."""
        super().__init__(coordinator)
        self._client = client
        self._scene_id = scene_info["id"]
        self._attr_name = scene_info["name"]
        self._attr_unique_id = f"savant_scene_{self._scene_id}"

    async def async_activate(self, **kwargs: Any) -> None:
        """Activate the scene."""
        _LOGGER.info(f"Activating scene: {self.name}")
        await self._client.activate_scene(self._scene_id)
