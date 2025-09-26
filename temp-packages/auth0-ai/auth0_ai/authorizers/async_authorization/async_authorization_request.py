from typing import TypedDict

class AsyncAuthorizationRequest(TypedDict):
    """
    Attributes:
        id (str): The authorization request ID. Use this ID to check the status of the authorization request.
        requested_at (float): The timestamp (in seconds since the Unix epoch) when the authorization request was made.
        expires_in (int): The time in seconds for the authorization request to expire.
        interval (int): The interval to use when polling the status.
    """
    id: str
    requested_at: float
    expires_in: int
    interval: int
