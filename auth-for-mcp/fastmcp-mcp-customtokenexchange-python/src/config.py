"""Configuration settings for the MCP server."""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    """Application configuration loaded from environment variables."""

    # Auth0 configuration
    auth0_domain: str = os.getenv("AUTH0_DOMAIN", "")
    auth0_audience: str = os.getenv("AUTH0_AUDIENCE", "")

    # MCP Auth0 client credentials and configuration for CTE
    mcp_auth0_client_id: str = os.getenv("MCP_AUTH0_CLIENT_ID", "")
    mcp_auth0_client_secret: str = os.getenv("MCP_AUTH0_CLIENT_SECRET", "")
    mcp_auth0_subject_token_type: str = os.getenv("MCP_AUTH0_SUBJECT_TOKEN_TYPE", "")
    mcp_auth0_exchange_scope: str = os.getenv("MCP_AUTH0_EXCHANGE_SCOPE", "")

    # Upstream API configuration
    api_auth0_audience: str = os.getenv("API_AUTH0_AUDIENCE", "")
    api_base_url: str = os.getenv("API_BASE_URL", "http://localhost:8787")

    # Server configuration
    port: int = int(os.getenv("PORT", "3001"))
    mcp_server_url: str = os.getenv("MCP_SERVER_URL", f"http://localhost:{port}")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    # CORS configuration
    cors_origins: list[str] = os.getenv("CORS_ORIGINS", "*").split(",")


def get_config() -> Config:
    """Get the application configuration."""
    return Config()
