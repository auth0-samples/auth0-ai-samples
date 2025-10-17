from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    auth0_domain: str
    auth0_audience: str
    mcp_server_url: str
    port: int = 3001
    debug: bool = True
    cors_origins: list[str] = field(default_factory=lambda: ["*"])

    @classmethod
    def from_env(cls) -> Config:
        auth0_domain = os.getenv("AUTH0_DOMAIN")
        if not auth0_domain:
            raise ValueError("AUTH0_DOMAIN environment variable is required")

        auth0_audience = os.getenv("AUTH0_AUDIENCE")
        if not auth0_audience:
            raise ValueError("AUTH0_AUDIENCE environment variable is required")

        return cls(
            auth0_domain=auth0_domain,
            auth0_audience=auth0_audience,
            mcp_server_url=os.getenv("MCP_SERVER_URL", "http://localhost:3001"),
            port=int(os.getenv("PORT", "3001")),
            debug=os.getenv("DEBUG", "false").lower() == "true",
            cors_origins=os.getenv("CORS_ORIGINS", "*").split(","),
        )


def get_config() -> Config:
    """Get application configuration."""
    load_dotenv()
    return Config.from_env()
