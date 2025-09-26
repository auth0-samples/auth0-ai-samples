from typing import Final
from auth0_ai.interrupts.auth0_interrupt import Auth0Interrupt

class TokenVaultInterrupt(Auth0Interrupt):
    """
    Error thrown when a tool call requires an access token for an external service.

    Throw this error if the service returns Unauthorized for the current access token.
    """

    code: Final[str] = "TOKEN_VAULT_ERROR"

    def __init__(self, message: str, connection: str, scopes: list[str], required_scopes: list[str]):
        """
        Initializes a TokenVaultInterrupt instance.

        Args:
            message (str): Error message describing the reason for the interrupt.
            connection (str): The Auth0 connection name.
            scopes (list[str]): The scopes required to access the external service as stated in the authorizer.
            required_scopes (list[str]): The union between the current scopes of the Access Token plus the required scopes.
                                         This is the list of scopes that will be used to request a new Access Token.
        """
        super().__init__(message, self.code)
        self.connection = connection
        self.scopes = scopes
        self.required_scopes = required_scopes
    
    def __copy__(self):
        return type(self)(
            self.args[0],
            self.connection,
            self.scopes,
            self.required_scopes
        )

    def __deepcopy__(self, memo):
        import copy
        return type(self)(
            copy.deepcopy(self.args[0], memo),
            copy.deepcopy(self.connection, memo),
            copy.deepcopy(self.scopes, memo),
            copy.deepcopy(self.required_scopes, memo),
        )


class TokenVaultError(Exception):
    """
    Error thrown when a tool call requires an access token for an external service.

    The authorizer will automatically convert this class of error to TokenVaultInterrupt.
    """

    def __init__(self, message: str):
        """
        Initializes a TokenVaultError instance.

        Args:
            message (str): Error message describing the reason for the error.
        """
        super().__init__(message)
