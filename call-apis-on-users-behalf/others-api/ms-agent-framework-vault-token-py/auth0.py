from auth0_fastapi.auth import AuthClient
from auth0_fastapi.config import Auth0Config
from config import Settings

settings = Settings()

auth0_config = Auth0Config(
    domain=settings.AUTH0_DOMAIN,
    client_id=settings.AUTH0_CLIENT_ID,
    client_secret=settings.AUTH0_CLIENT_SECRET,
    authorization_params={
        "scope": "openid profile email offline_access",
        "prompt": "consent"
    },
    app_base_url=settings.app_base_url,
    secret=settings.SESSION_SECRET)

auth0_client = AuthClient(auth0_config)
