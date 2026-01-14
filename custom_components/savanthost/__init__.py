import asyncio
import logging
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_HOST, CONF_PORT, SCAN_INTERVAL_SECONDS
from .api import SavantClient

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["scene"]

async def async_setup(hass: HomeAssistant, config: dict):
    """Set up the SavantHost component."""
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry):
    """Set up SavantHost from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    host = entry.data[CONF_HOST]
    port = entry.data[CONF_PORT]
    
    session = async_get_clientsession(hass)
    client = SavantClient(session, host, port)

    async def async_update_data():
        """Fetch data from API."""
        scenes = await client.get_scenes()
        if not scenes:
            # Don't raise UpdateFailed for empty scenes, just log
            _LOGGER.debug("No scenes found or host unreachable")
            return []
        return scenes

    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name="savant_scenes",
        update_method=async_update_data,
        update_interval=timedelta(seconds=SCAN_INTERVAL_SECONDS),
    )

    # Fetch initial data
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
        "client": client
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry):
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok
