from __future__ import annotations


class AuthenticationRequired(Exception):
    """
    Raised when authentication is required but missing.

    This maps to HTTP 401 Unauthorized status.
    Indicates the request lacks valid authentication credentials.
    """
    status_code = 401
    error_code = "invalid_token"
    default_description = "Authentication required"

    def __init__(self, message: str | None = None):
        self.description = message or self.default_description
        super().__init__(self.description)


class InsufficientScope(Exception):
    """
    Raised when user lacks required OAuth scopes.

    This maps to HTTP 403 Forbidden status.
    Indicates the user is authenticated but doesn't have permission
    to access the requested resource due to insufficient scopes.
    """
    status_code = 403
    error_code = "insufficient_scope"
    default_description = "Insufficient scope"

    def __init__(self, message: str | None = None):
        self.description = message or self.default_description
        super().__init__(self.description)


class MalformedAuthorizationRequest(Exception):
    """
    Raised when authorization request is malformed.

    This maps to HTTP 400 Bad Request status.
    Indicates the authorization header or token format is invalid.
    """
    status_code = 400
    error_code = "invalid_request"
    default_description = "Malformed authorization request"

    def __init__(self, message: str | None = None):
        self.description = message or self.default_description
        super().__init__(self.description)
