import logging
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN, CONF_AUTH_CODE, CONF_HOST, CONF_PORT, DEFAULT_PORT
from .auth import get_device_id, generate_address_code, validate_auth_code
from .discovery import SavantDiscovery

_LOGGER = logging.getLogger(__name__)

class SavantConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SavantHost."""

    VERSION = 1

    def __init__(self):
        """Initialize."""
        self.auth_code = None
        self.discovered_hosts = []

    async def async_step_user(self, user_input=None):
        """Step 1: Handle the initial step (Auth Code)."""
        errors = {}
        
        # Calculate device info to show to user
        device_id = get_device_id()
        address_code = generate_address_code(device_id)
        
        description_placeholders = {
            "address_code": address_code
        }

        if user_input is not None:
            self.auth_code = user_input[CONF_AUTH_CODE]
            
            # Validate Auth Code
            if validate_auth_code(address_code, self.auth_code):
                # Auth success, proceed to discovery
                return await self.async_step_discovery()
            else:
                errors["base"] = "invalid_auth_code"

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_AUTH_CODE): str,
            }),
            errors=errors,
            description_placeholders=description_placeholders,
        )

    async def async_step_discovery(self, user_input=None):
        """Step 2: Auto discover hosts."""
        if user_input is None:
            # Run discovery
            discovery = SavantDiscovery(self.hass)
            self.discovered_hosts = await discovery.discover()

            if not self.discovered_hosts:
                # No hosts found, fallback to manual entry
                return await self.async_step_manual()
            
            if len(self.discovered_hosts) == 1:
                # One host found, auto select
                host = self.discovered_hosts[0]
                return self.async_create_entry(
                    title=f"Savant Host ({host['ip']})",
                    data={
                        CONF_AUTH_CODE: self.auth_code,
                        CONF_HOST: host["ip"],
                        CONF_PORT: host["port"]
                    }
                )

        # Multiple hosts found, let user select
        if user_input is not None:
            # Find selected host
            selected_ip = user_input[CONF_HOST]
            selected_host = next((h for h in self.discovered_hosts if h["ip"] == selected_ip), None)
            
            if selected_host:
                return self.async_create_entry(
                    title=f"Savant Host ({selected_host['ip']})",
                    data={
                        CONF_AUTH_CODE: self.auth_code,
                        CONF_HOST: selected_host["ip"],
                        CONF_PORT: selected_host["port"]
                    }
                )

        # Show selection form
        host_options = {h["ip"]: f"{h['name']} ({h['ip']})" for h in self.discovered_hosts}
        
        return self.async_show_form(
            step_id="discovery",
            data_schema=vol.Schema({
                vol.Required(CONF_HOST): vol.In(host_options),
            }),
        )

    async def async_step_manual(self, user_input=None):
        """Step 3: Manual configuration if discovery fails."""
        errors = {}
        
        if user_input is not None:
            return self.async_create_entry(
                title=f"Savant Host ({user_input[CONF_HOST]})",
                data={
                    CONF_AUTH_CODE: self.auth_code,
                    CONF_HOST: user_input[CONF_HOST],
                    CONF_PORT: user_input[CONF_PORT]
                }
            )

        return self.async_show_form(
            step_id="manual",
            data_schema=vol.Schema({
                vol.Required(CONF_HOST): str,
                vol.Required(CONF_PORT, default=DEFAULT_PORT): int,
            }),
            errors=errors,
        )
