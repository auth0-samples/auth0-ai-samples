import os
from dotenv import load_dotenv
from auth0_fastapi.auth import AuthClient
from auth0_fastapi.config import Auth0Config

load_dotenv()

auth0_config = Auth0Config(
    domain=os.getenv("AUTH0_DOMAIN"),
    client_id=os.getenv("AUTH0_CLIENT_ID"),
    client_secret=os.getenv("AUTH0_CLIENT_SECRET"),
    authorization_params={
        "scope": "openid profile email offline_access",
        "prompt": "consent"
    },
    app_base_url=f"http://{os.getenv('HOST', 'localhost')}:{os.getenv('PORT', '8000')}",
    secret=os.getenv("SESSION_SECRET", "SOME_RANDOM_SECRET_KEY")
)

auth0_client = AuthClient(auth0_config)
