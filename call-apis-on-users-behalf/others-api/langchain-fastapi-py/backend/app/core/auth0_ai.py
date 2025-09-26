from auth0_ai.authorizers.types import Auth0ClientParams
from auth0_ai_langchain.auth0_ai import Auth0AI

from app.core.config import settings

auth0_ai = Auth0AI(
    Auth0ClientParams(
        {
            "domain": settings.AUTH0_DOMAIN,
            "client_id": settings.AUTH0_CLIENT_ID,
            "client_secret": settings.AUTH0_CLIENT_SECRET,
        }
    )
)

with_calendar_access = auth0_ai.with_token_vault(
    connection="google-oauth2",
    scopes=["https://www.googleapis.com/auth/calendar.events"],
)