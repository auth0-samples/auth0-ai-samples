"""
Custom exceptions for auth0-api-python SDK with HTTP response metadata
"""


class BaseAuthError(Exception):
    """Base class for all auth errors with HTTP response metadata."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message
        self.name = self.__class__.__name__
        self._headers = {}  # Will be set by ApiClient._prepare_error

    def get_status_code(self) -> int:
        """Return the HTTP status code for this error."""
        raise NotImplementedError("Subclasses must implement get_status_code()")

    def get_error_code(self) -> str:
        """Return the OAuth/DPoP error code."""
        raise NotImplementedError("Subclasses must implement get_error_code()")

    def get_error_description(self) -> str:
        """Return the error description."""
        return self.message

    def get_headers(self) -> dict[str, str]:
        """Return HTTP headers (including WWW-Authenticate if set)."""
        return self._headers


class MissingRequiredArgumentError(BaseAuthError):
    """Error raised when a required argument is missing."""

    def __init__(self, argument: str, message: str = None):
        if message:
            super().__init__(message)
        else:
            super().__init__(f"The argument '{argument}' is required but was not provided.")
        self.argument = argument

    def get_status_code(self) -> int:
        return 400

    def get_error_code(self) -> str:
        return "invalid_request"


class VerifyAccessTokenError(BaseAuthError):
    """Error raised when verifying the access token fails."""

    def get_status_code(self) -> int:
        return 401

    def get_error_code(self) -> str:
        return "invalid_token"


class InvalidAuthSchemeError(BaseAuthError):
    """Error raised when the provided authentication scheme is unsupported."""

    def __init__(self, message: str):
        super().__init__(message)
        if ":" in message and "'" in message:
            self.scheme = message.split("'")[1]
        else:
            self.scheme = None

    def get_status_code(self) -> int:
        return 400

    def get_error_code(self) -> str:
        return "invalid_request"


class InvalidDpopProofError(BaseAuthError):
    """Error raised when validating a DPoP proof fails."""

    def get_status_code(self) -> int:
        return 400

    def get_error_code(self) -> str:
        return "invalid_dpop_proof"


class MissingAuthorizationError(BaseAuthError):
    """Authorization header is missing, empty, or malformed."""

    def __init__(self):
        super().__init__("")

    def get_status_code(self) -> int:
        return 400

    def get_error_code(self) -> str:
        return "invalid_request"


class GetAccessTokenForConnectionError(BaseAuthError):
    """Error raised when getting a token for a connection fails."""

    def get_status_code(self) -> int:
        return 400

    def get_error_code(self) -> str:
        return "get_access_token_for_connection_error"


class GetTokenByExchangeProfileError(BaseAuthError):
    """Error raised when getting a token via exchange profile fails."""

    def get_status_code(self) -> int:
        return 400

    def get_error_code(self) -> str:
        return "get_token_by_exchange_profile_error"


class ApiError(BaseAuthError):
    """
    Error raised when an API request to Auth0 fails.
    Contains details about the original error from Auth0.
    """

    def __init__(self, code: str, message: str, status_code=500, cause=None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.cause = cause

        if cause:
            self.error = getattr(cause, "error", None)
            self.error_description = getattr(cause, "error_description", None)
        else:
            self.error = None
            self.error_description = None

    def get_status_code(self) -> int:
        return self.status_code

    def get_error_code(self) -> str:
        return self.code


class ConfigurationError(BaseAuthError):
    """Error raised when SDK configuration is invalid."""

    def get_status_code(self) -> int:
        return 500

    def get_error_code(self) -> str:
        return "invalid_configuration"


class DomainsResolverError(BaseAuthError):
    """Error raised when domains resolver function fails."""

    def get_status_code(self) -> int:
        return 500

    def get_error_code(self) -> str:
        return "domains_resolver_error"
