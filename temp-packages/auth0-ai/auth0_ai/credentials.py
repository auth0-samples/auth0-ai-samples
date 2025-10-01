from typing import TypedDict, Optional

class TokenResponse(TypedDict):
    access_token: str
    expires_in: int
    scope: list[str]
    token_type: Optional[str]
    id_token: Optional[str]
    refresh_token: Optional[str]
