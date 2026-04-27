import asyncio
import time
from collections.abc import Mapping, Sequence
from typing import Any, Optional, Union

import httpx
from authlib.jose import JsonWebKey, JsonWebToken

from .cache import InMemoryCache
from .config import ApiClientOptions
from .errors import (
    ApiError,
    BaseAuthError,
    ConfigurationError,
    DomainsResolverError,
    GetAccessTokenForConnectionError,
    GetTokenByExchangeProfileError,
    InvalidAuthSchemeError,
    InvalidDpopProofError,
    MissingAuthorizationError,
    MissingRequiredArgumentError,
    VerifyAccessTokenError,
)
from .types import OnBehalfOfTokenResult
from .utils import (
    calculate_jwk_thumbprint,
    fetch_jwks,
    fetch_oidc_metadata,
    get_unverified_header,
    get_unverified_payload,
    normalize_domain,
    normalize_url_for_htu,
    sha256_base64url,
)

# Token Exchange constants
TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange"  # noqa: S105
OBO_ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token"  # noqa: S105
MAX_ARRAY_VALUES_PER_KEY = 20  # DoS protection for extra parameter arrays

# OAuth parameter denylist - parameters that cannot be overridden via extras
RESERVED_PARAMS = frozenset([
    "grant_type", "client_id", "client_secret", "client_assertion",
    "client_assertion_type", "subject_token", "subject_token_type",
    "requested_token_type", "actor_token", "actor_token_type",
    "subject_issuer", "audience", "aud", "resource", "resources",
    "resource_indicator", "scope", "connection", "login_hint",
    "organization", "assertion",
])


class ApiClient:
    """
    The main class for discovering OIDC metadata (issuer, jwks_uri) and verifying
    Auth0-issued JWT access tokens in an async environment.
    """

    def __init__(self, options: ApiClientOptions):
        # Validate audience is always required
        if not options.audience:
            raise MissingRequiredArgumentError("audience")

        # Validate domains parameter if provided
        if options.domains is not None:
            if isinstance(options.domains, list):
                # Static list validation
                if len(options.domains) == 0:
                    raise ConfigurationError("domains list cannot be empty")
                if not all(isinstance(d, str) and d.strip() for d in options.domains):
                    raise ConfigurationError(
                        "domains list must contain only non-empty strings"
                    )
                # Normalize and store domains
                self._allowed_domains = [normalize_domain(d) for d in options.domains]
            elif callable(options.domains):
                # Dynamic resolver - store the function
                self._allowed_domains = options.domains
            else:
                raise ConfigurationError(
                    "domains must be either a list of domain strings or a callable resolver function"
                )
        else:
            # Single domain mode
            self._allowed_domains = None

        # Validate domain/domains configuration
        if not options.domain and not options.domains:
            raise ConfigurationError(
                "Must provide either 'domain' or 'domains' parameter. "
                "Use 'domain' for single-domain mode, 'domains' for multi-domain support."
            )

        # Validate that domain is set when client_id is configured
        if options.client_id and not options.domain:
            raise ConfigurationError(
                "The 'domain' parameter is required when 'client_id' is configured."
            )
        self.options = options

        # Validate cache configuration
        if not isinstance(options.cache_ttl_seconds, (int, float)) or options.cache_ttl_seconds < 0:
            raise ConfigurationError("cache_ttl_seconds must be a non-negative number")

        if not isinstance(options.cache_max_entries, int) or options.cache_max_entries < 2:
            raise ConfigurationError("cache_max_entries must be an integer greater than 1")

        if options.cache_adapter:
            self._discovery_cache = options.cache_adapter
            self._jwks_cache = options.cache_adapter
        else:
            self._discovery_cache = InMemoryCache(max_entries=options.cache_max_entries)
            self._jwks_cache = InMemoryCache(max_entries=options.cache_max_entries)

        self._cache_ttl = options.cache_ttl_seconds

        self._jwt = JsonWebToken(["RS256"])

        self._dpop_algorithms = ["ES256"]
        self._dpop_jwt = JsonWebToken(self._dpop_algorithms)

    def is_dpop_required(self) -> bool:
        """Check if DPoP authentication is required."""
        return getattr(self.options, "dpop_required", False)

    async def _resolve_allowed_domains(
        self,
        unverified_iss: str,
        request_url: Optional[str] = None,
        request_headers: Optional[dict] = None
    ) -> Optional[list[str]]:
        """
        Resolve and validate allowed domains for the given issuer.

        Handles three modes:
        1. Static list: Returns normalized list, validates issuer against it
        2. Dynamic resolver: Invokes resolver function, validates issuer against result
        3. Single domain: Returns None (backward compatibility, uses domain)

        Args:
            unverified_iss: The issuer claim from the token (not yet verified)
            request_url: Optional request URL for dynamic resolvers
            request_headers: Optional request headers for dynamic resolvers

        Returns:
            List of normalized allowed domain strings

        Raises:
            DomainsResolverError: If resolver invocation fails
            VerifyAccessTokenError: If issuer is not in allowed domains
        """
        # Single domain mode
        if self._allowed_domains is None:
            return None

        # Static list mode
        if isinstance(self._allowed_domains, list):
            allowed_domains = self._allowed_domains
        # Dynamic resolver mode
        elif callable(self._allowed_domains):
            # Build resolver context
            context = {
                'request_url': request_url,
                'request_headers': request_headers,
                'unverified_iss': unverified_iss
            }

            # Invoke resolver (supports both sync and async resolvers)
            try:
                result = self._allowed_domains(context)
                if asyncio.iscoroutine(result) or asyncio.isfuture(result):
                    result = await result
            except Exception as e:
                raise DomainsResolverError(
                    f"Domains resolver function failed: {str(e)}"
                ) from e

            # Validate resolver result
            if not isinstance(result, list):
                raise DomainsResolverError(
                    "Domains resolver must return a list"
                )

            if len(result) == 0:
                raise DomainsResolverError(
                    "Domains resolver returned an empty list"
                )

            if not all(isinstance(d, str) and d.strip() for d in result):
                raise DomainsResolverError(
                    "Domains resolver must return a list of non-empty strings"
                )

            # Normalize domains from resolver
            try:
                allowed_domains = [normalize_domain(d) for d in result]
            except ValueError as e:
                raise DomainsResolverError(
                    f"Domains resolver returned invalid domain: {str(e)}"
                ) from e
        else:
            # Should never happen due to __init__ validation
            raise ConfigurationError("Invalid _allowed_domains type")

        # Validate issuer is in allowed domains
        if unverified_iss not in allowed_domains:
            raise VerifyAccessTokenError(
                "Token issuer is not in the list of allowed domains"
            )

        return allowed_domains

    async def verify_request(
        self,
        headers: dict[str, str],
        http_method: Optional[str] = None,
        http_url: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Dispatch based on Authorization scheme:
          • If scheme is 'DPoP', verifies both access token and DPoP proof
          • If scheme is 'Bearer', verifies only the access token

        Note:
            Authorization header parsing uses split(None, 1) to correctly handle
            tabs and multiple spaces per HTTP specs. Malformed headers with multiple
            spaces now raise VerifyAccessTokenError during JWT parsing (previously
            raised InvalidAuthSchemeError).

        Args:
            headers: HTTP headers dict containing (header keys should be lowercase):
                - "authorization": The Authorization header value (required)
                - "dpop": The DPoP proof header value (required for DPoP)
            http_method: The HTTP method (required for DPoP)
            http_url: The HTTP URL (required for DPoP, also used for MCD resolver context)

        Returns:
            The decoded access token claims, including `act` when present.

        Raises:
            MissingRequiredArgumentError: If required args are missing
            InvalidAuthSchemeError: If an unsupported scheme is provided
            InvalidDpopProofError: If DPoP verification fails
            VerifyAccessTokenError: If access token verification fails
        """
        # Normalize header keys to lowercase for robust access
        headers = {k.lower(): v for k, v in headers.items()}

        authorization_header = headers.get("authorization", "")
        dpop_proof = headers.get("dpop")

        if not authorization_header:
            if self.is_dpop_required():
                raise self._prepare_error(
                        InvalidAuthSchemeError("")
                    )
            else:
                raise self._prepare_error(MissingAuthorizationError())

        # Split authorization header on first whitespace
        parts = authorization_header.split(None, 1)
        if len(parts) != 2:
            raise self._prepare_error(MissingAuthorizationError())

        scheme, token = parts
        scheme = scheme.lower()

        if self.is_dpop_required() and scheme != "dpop":
            raise self._prepare_error(
                InvalidAuthSchemeError(""),
                auth_scheme=scheme
            )
        if not token.strip():
            raise self._prepare_error(MissingAuthorizationError())


        if scheme == "dpop":
            if not self.options.dpop_enabled:
                raise self._prepare_error(MissingAuthorizationError())

            if not dpop_proof:
                if self.is_dpop_required():
                    raise self._prepare_error(
                        InvalidAuthSchemeError(""),
                        auth_scheme=scheme
                    )
                else:
                    raise self._prepare_error(
                        InvalidAuthSchemeError(""),
                        auth_scheme=scheme
                    )

            if "," in dpop_proof:
                raise self._prepare_error(
                    InvalidDpopProofError("Multiple DPoP proofs are not allowed"),
                    auth_scheme=scheme
                )

            try:
                dpop_header = get_unverified_header(dpop_proof)
            except Exception:
                raise self._prepare_error(InvalidDpopProofError("Failed to verify DPoP proof"), auth_scheme=scheme)

            if not http_method or not http_url:
                missing_params = []
                if not http_method:
                    missing_params.append("http_method")
                if not http_url:
                    missing_params.append("http_url")

                raise self._prepare_error(
                    MissingRequiredArgumentError(f"DPoP authentication requires {' and '.join(missing_params)}"),
                    auth_scheme=scheme
                )

            try:
                access_token_claims = await self.verify_access_token(
                    token,
                    request_url=http_url,
                    request_headers=headers
                )
            except VerifyAccessTokenError as e:
                raise self._prepare_error(e, auth_scheme=scheme)

            cnf_claim = access_token_claims.get("cnf")

            if not cnf_claim:
                raise self._prepare_error(
                    VerifyAccessTokenError("JWT Access Token has no jkt confirmation claim"),
                    auth_scheme=scheme
                )

            if not isinstance(cnf_claim, dict):
                raise self._prepare_error(
                    VerifyAccessTokenError("JWT Access Token has invalid confirmation claim format"),
                    auth_scheme=scheme
                )
            try:
                await self.verify_dpop_proof(
                    access_token=token,
                    proof=dpop_proof,
                    http_method=http_method,
                    http_url=http_url
                )
            except InvalidDpopProofError as e:
                raise self._prepare_error(e, auth_scheme=scheme)

            # DPoP binding verification
            jwk_dict = dpop_header["jwk"]
            actual_jkt = calculate_jwk_thumbprint(jwk_dict)
            expected_jkt = cnf_claim.get("jkt")

            if not expected_jkt:
                raise self._prepare_error(
                    VerifyAccessTokenError("Access token 'cnf' claim missing 'jkt'"),
                    auth_scheme=scheme
                )

            if expected_jkt != actual_jkt:
                raise self._prepare_error(
                    VerifyAccessTokenError("JWT Access Token confirmation mismatch"),
                    auth_scheme=scheme
                )

            return access_token_claims

        if scheme == "bearer":
            try:
                claims = await self.verify_access_token(
                    token,
                    request_url=http_url,
                    request_headers=headers
                )
                if claims.get("cnf") and isinstance(claims["cnf"], dict) and claims["cnf"].get("jkt"):
                    if self.options.dpop_enabled:
                        raise self._prepare_error(
                            VerifyAccessTokenError(
                                "DPoP-bound token requires the DPoP authentication scheme, not Bearer"
                            ),
                            auth_scheme=scheme
                        )
                if dpop_proof:
                    if self.options.dpop_enabled:
                        raise self._prepare_error(
                            InvalidAuthSchemeError(
                                "DPoP proof requires DPoP authentication scheme, not Bearer"
                            ),
                            auth_scheme=scheme
                        )
                return claims
            except VerifyAccessTokenError as e:
                raise self._prepare_error(e, auth_scheme=scheme)

        raise self._prepare_error(MissingAuthorizationError())

    async def verify_access_token(
        self,
        access_token: str,
        request_url: Optional[str] = None,
        request_headers: Optional[dict] = None,
        required_claims: Optional[list[str]] = None
    ) -> dict[str, Any]:
        """
        Asynchronously verifies the provided JWT access token.

        - Fetches OIDC metadata and JWKS if not already cached.
        - Decodes and validates signature (RS256) with the correct key.
        - Checks standard claims: 'iss', 'aud', 'exp', 'iat'
        - Checks extra required claims if 'required_claims' is provided.

        Args:
            access_token: The JWT access token to verify
            request_url: Optional request URL for dynamic domain resolvers
            request_headers: Optional request headers dict for dynamic domain resolvers
            required_claims: Optional list of additional claim names that must be present

        Returns:
            The decoded token claims if valid, including `act` when present.

        Raises:
            MissingRequiredArgumentError: If no token is provided.
            VerifyAccessTokenError: If verification fails (signature, claims mismatch, etc.).
            DomainsResolverError: If domains resolver function fails.
        """
        if not access_token:
            raise MissingRequiredArgumentError("access_token")

        required_claims = required_claims or []

        # Extract header and payload without signature verification
        try:
            header = get_unverified_header(access_token)
        except Exception as e:
            raise VerifyAccessTokenError(f"Failed to parse token header: {str(e)}") from e

        # Reject symmetric algorithms
        alg = header.get('alg', '')
        if alg.startswith('HS'):
            raise VerifyAccessTokenError(
                f"Symmetric algorithm '{alg}' is not supported. "
                "Only asymmetric algorithms (e.g., RS256) are allowed."
            )

        # Extract and validate issuer claim (before network calls)
        try:
            unverified_payload = get_unverified_payload(access_token)
        except Exception as e:
            raise VerifyAccessTokenError(f"Failed to parse token payload: {str(e)}") from e

        unverified_iss = unverified_payload.get('iss')
        if not unverified_iss:
            raise VerifyAccessTokenError("Token missing 'iss' claim")

        # Normalize issuer for validation
        try:
            normalized_iss = normalize_domain(unverified_iss)
        except ValueError as e:
            raise VerifyAccessTokenError(f"Invalid token issuer format: {str(e)}") from e

        # Validate issuer against allowed domains (MCD)
        if self._allowed_domains is not None:
            await self._resolve_allowed_domains(
                normalized_iss,
                request_url=request_url,
                request_headers=request_headers
            )

        # Fetch OIDC discovery metadata
        try:
            if self._allowed_domains is not None:
                metadata = await self._discover(issuer=normalized_iss)
            else:
                metadata = await self._discover()
        except VerifyAccessTokenError:
            raise
        except Exception as e:
            raise VerifyAccessTokenError(
                f"Failed to fetch OIDC discovery metadata: {str(e)}"
            ) from e

        # First issuer validation: Prevent issuer confusion attacks
        discovery_issuer = metadata.get("issuer")
        if not discovery_issuer:
            raise VerifyAccessTokenError("Discovery metadata missing 'issuer' field")

        # Normalize discovery issuer for comparison
        try:
            normalized_discovery_issuer = normalize_domain(discovery_issuer)
        except ValueError as e:
            raise VerifyAccessTokenError(f"Invalid discovery issuer format: {str(e)}") from e

        if normalized_iss != normalized_discovery_issuer:
            raise VerifyAccessTokenError(
                "Token issuer does not match the discovery issuer"
            )

        # Extract JWKS URI from discovery metadata
        jwks_uri = metadata.get("jwks_uri")
        if not jwks_uri:
            raise VerifyAccessTokenError("Discovery metadata missing 'jwks_uri' field")

        # Fetch JWKS from discovery's jwks_uri
        try:
            jwks_data = await self._fetch_jwks(jwks_uri)
        except VerifyAccessTokenError:
            raise
        except Exception as e:
            raise VerifyAccessTokenError(
                f"Failed to fetch JWKS: {str(e)}"
            ) from e

        # Extract kid for JWKS lookup
        kid = header.get("kid")
        if not kid:
            raise VerifyAccessTokenError("Token header missing 'kid' claim")

        # Find matching key
        matching_key_dict = None
        for key_dict in jwks_data["keys"]:
            if key_dict.get("kid") == kid:
                matching_key_dict = key_dict
                break

        if not matching_key_dict:
            raise VerifyAccessTokenError("No matching key found in JWKS")

        # Import public key and verify signature
        public_key = JsonWebKey.import_key(matching_key_dict)

        if isinstance(access_token, str) and access_token.startswith("b'"):
            access_token = access_token[2:-1]
        try:
            claims = self._jwt.decode(access_token, public_key)
        except Exception as e:
            raise VerifyAccessTokenError(f"Signature verification failed: {str(e)}") from e

        # Second issuer validation: Ensure verified token wasn't tampered
        if claims.get("iss") != discovery_issuer:
            raise VerifyAccessTokenError(
                "Verified Token issuer does not match the discovery issuer"
            )

        expected_aud = self.options.audience
        actual_aud = claims.get("aud")

        if isinstance(actual_aud, list):
            if expected_aud not in actual_aud:
                raise VerifyAccessTokenError("Audience mismatch (not in token's aud array)")
        else:
            if actual_aud != expected_aud:
                raise VerifyAccessTokenError("Audience mismatch (single aud)")

        now = int(time.time())
        if "exp" not in claims or now >= claims["exp"]:
            raise VerifyAccessTokenError("Token is expired")
        if "iat" not in claims:
            raise VerifyAccessTokenError("Missing 'iat' claim in token")

        # Additional required_claims
        for rc in required_claims:
            if rc not in claims:
                raise VerifyAccessTokenError(f"Missing required claim: {rc}")

        return claims

    async def verify_dpop_proof(
        self,
        access_token: str,
        proof: str,
        http_method: str,
        http_url: str
    ) -> dict[str, Any]:
        """
        1. Single well-formed compact JWS
        2. typ="dpop+jwt", alg∈allowed, alg≠none
        3. jwk header present & public only
        4. Signature verifies with jwk
        5. Validates all required claims
        Raises InvalidDpopProofError on any failure.
        """
        if not proof:
            raise MissingRequiredArgumentError("dpop_proof")
        if not access_token:
            raise MissingRequiredArgumentError("access_token")
        if not http_method or not http_url:
            raise MissingRequiredArgumentError("http_method/http_url")

        header = get_unverified_header(proof)

        if header.get("typ") != "dpop+jwt":
            raise InvalidDpopProofError("Unexpected JWT 'typ' header parameter value")

        alg = header.get("alg")
        if alg not in self._dpop_algorithms:
            raise InvalidDpopProofError("Unsupported algorithm in DPoP proof")

        jwk_dict = header.get("jwk")
        if not jwk_dict or not isinstance(jwk_dict, dict):
            raise InvalidDpopProofError("Missing or invalid jwk in header")

        if "d" in jwk_dict:
            raise InvalidDpopProofError("Private key material found in jwk header")

        if jwk_dict.get("kty") != "EC":
            raise InvalidDpopProofError("Only EC keys are supported for DPoP")

        if jwk_dict.get("crv") != "P-256":
            raise InvalidDpopProofError("Only P-256 curve is supported")

        public_key = JsonWebKey.import_key(jwk_dict)
        try:
            claims = self._dpop_jwt.decode(proof, public_key)
        except Exception as e:
            raise InvalidDpopProofError(f"JWT signature verification failed: {e}")

        # Checks all required claims are present
        self._validate_claims_presence(claims, ["iat", "ath", "htm", "htu", "jti"])

        jti = claims["jti"]

        if not isinstance(jti, str):
            raise InvalidDpopProofError("jti claim must be a string")

        if not jti.strip():
            raise InvalidDpopProofError("jti claim must not be empty")


        now = int(time.time())
        iat = claims["iat"]
        offset = getattr(self.options, "dpop_iat_offset", 300)    # default 5 minutes
        leeway = getattr(self.options, "dpop_iat_leeway", 30)     # default 30 seconds

        if not isinstance(iat, (int, float)):
            raise InvalidDpopProofError("Invalid iat claim (must be integer or float)")

        if iat < now - offset:
            raise InvalidDpopProofError("DPoP Proof iat is too old")
        elif iat > now + leeway:
            raise InvalidDpopProofError("DPoP Proof iat is from the future")

        if claims["htm"].lower() != http_method.lower():
            raise InvalidDpopProofError("DPoP Proof htm mismatch")

        try:
            normalized_htu = normalize_url_for_htu(claims["htu"])
            normalized_http_url = normalize_url_for_htu(http_url)
            if normalized_htu != normalized_http_url:
                raise InvalidDpopProofError("DPoP Proof htu mismatch")
        except ValueError:
            raise InvalidDpopProofError("DPoP Proof htu mismatch")

        if claims["ath"] != sha256_base64url(access_token):
            raise InvalidDpopProofError("DPoP Proof ath mismatch")

        return claims

    async def get_access_token_for_connection(self, options: dict[str, Any]) -> dict[str, Any]:
        """
        Retrieves a token for a connection.

        Args:
            options: Options for retrieving an access token for a connection.
                Must include 'connection' and 'access_token' keys.
                May optionally include 'login_hint'.

        Raises:
            GetAccessTokenForConnectionError: If there was an issue requesting the access token.
            ApiError: If the token exchange endpoint returns an error.

        Returns:
            Dictionary containing the token response with access_token, expires_in, and scope.
        """
        # Constants
        SUBJECT_TYPE_ACCESS_TOKEN = "urn:ietf:params:oauth:token-type:access_token"  # noqa S105
        REQUESTED_TOKEN_TYPE_FEDERATED_CONNECTION_ACCESS_TOKEN = "http://auth0.com/oauth/token-type/federated-connection-access-token"  # noqa S105
        GRANT_TYPE_FEDERATED_CONNECTION_ACCESS_TOKEN = "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token"  # noqa S105
        connection = options.get("connection")
        access_token = options.get("access_token")

        if not connection:
            raise MissingRequiredArgumentError("connection")

        if not access_token:
            raise MissingRequiredArgumentError("access_token")

        client_id = self.options.client_id
        client_secret = self.options.client_secret
        if not client_id or not client_secret:
            raise GetAccessTokenForConnectionError("You must configure the SDK with a client_id and client_secret to use get_access_token_for_connection.")

        metadata = await self._discover()

        token_endpoint = metadata.get("token_endpoint")
        if not token_endpoint:
            raise GetAccessTokenForConnectionError(
                "Token endpoint missing in OIDC metadata. "
                "Verify your domain configuration and that the OIDC discovery endpoint "
                f"(https://{self.options.domain}/.well-known/openid-configuration) is accessible"
            )

        # Prepare parameters
        params = {
            "connection": connection,
            "requested_token_type": REQUESTED_TOKEN_TYPE_FEDERATED_CONNECTION_ACCESS_TOKEN,
            "grant_type": GRANT_TYPE_FEDERATED_CONNECTION_ACCESS_TOKEN,
            "client_id": client_id,
            "subject_token": access_token,
            "subject_token_type": SUBJECT_TYPE_ACCESS_TOKEN,
        }

        # Add login_hint if provided
        if "login_hint" in options and options["login_hint"]:
            params["login_hint"] = options["login_hint"]

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.options.timeout)) as client:
                response = await client.post(
                    token_endpoint,
                    data=params,
                    auth=(client_id, client_secret)
                )

                if response.status_code != 200:
                    # Lenient check for JSON error responses (handles application/json, text/json, etc.)
                    content_type = response.headers.get("content-type", "").lower()
                    error_data = response.json() if "json" in content_type else {}
                    raise ApiError(
                        error_data.get("error", "connection_token_error"),
                        error_data.get(
                            "error_description", f"Failed to get token for connection: {response.status_code}"),
                        response.status_code
                    )

                try:
                    token_endpoint_response = response.json()
                except ValueError:
                    raise ApiError("invalid_json", "Token endpoint returned invalid JSON.")

                access_token = token_endpoint_response.get("access_token")
                if not isinstance(access_token, str) or not access_token:
                    raise ApiError("invalid_response", "Missing or invalid access_token in response.", 502)

                expires_in_raw = token_endpoint_response.get("expires_in", 3600)
                try:
                    expires_in = int(expires_in_raw)
                except (TypeError, ValueError):
                    raise ApiError("invalid_response", "expires_in is not an integer.", 502)

                return {
                    "access_token": access_token,
                    "expires_at": int(time.time()) + expires_in,
                    "scope": token_endpoint_response.get("scope", "")
                }

        except httpx.TimeoutException as exc:
            raise ApiError(
                "timeout_error",
                f"Request to token endpoint timed out: {str(exc)}",
                504,
                exc
            )
        except httpx.HTTPError as exc:
            raise ApiError(
                "network_error",
                f"Network error occurred: {str(exc)}",
                502,
                exc
            )

    async def get_token_by_exchange_profile(
        self,
        subject_token: str,
        subject_token_type: str,
        audience: Optional[str] = None,
        scope: Optional[str] = None,
        requested_token_type: Optional[str] = None,
        extra: Optional[Mapping[str, Union[str, Sequence[str]]]] = None
    ) -> dict[str, Any]:
        """
        Exchange a subject token for an Auth0 token using RFC 8693.

        The matching Token Exchange Profile is selected by subject_token_type.
        This method requires a confidential client (client_id and client_secret must be configured).

        Args:
            subject_token: The token to be exchanged
            subject_token_type: URI identifying the token type (must match a Token Exchange Profile)
            audience: Optional target API identifier for the exchanged tokens
            scope: Optional space-separated OAuth 2.0 scopes to request
            requested_token_type: Optional type of token to issue (defaults to access token)
            extra: Optional additional parameters sent as form fields to Auth0.
                   All values are converted to strings before sending.
                   Arrays are limited to 20 values per key for DoS protection.
                   Cannot override reserved OAuth parameters (case-insensitive check).

        Returns:
            Dictionary containing:
            - access_token (str): The Auth0 access token
            - expires_in (int): Token lifetime in seconds
            - expires_at (int): Absolute expiration time as a Unix timestamp in seconds, calculated by the SDK from expires_in
            - id_token (str, optional): OpenID Connect ID token
            - refresh_token (str, optional): Refresh token
            - scope (str, optional): Granted scopes
            - token_type (str, optional): Token type (typically "Bearer")
            - issued_token_type (str, optional): RFC 8693 issued token type identifier

        Raises:
            MissingRequiredArgumentError: If required parameters are missing
            GetTokenByExchangeProfileError: If client credentials not configured, validation fails,
                                           or reserved parameters are supplied in extra
            ApiError: If the token endpoint returns an error

        Example:
            async def example():
                result = await api_client.get_token_by_exchange_profile(
                    subject_token=token,
                    subject_token_type="urn:example:subject-token",
                    audience="https://api.backend.com"
                )

        References:
            - Custom Token Exchange: https://auth0.com/docs/authenticate/custom-token-exchange
            - RFC 8693: https://datatracker.ietf.org/doc/html/rfc8693
            - Related SDK: https://github.com/auth0/auth0-auth-js
        """
        # Validate required parameters
        if not subject_token:
            raise MissingRequiredArgumentError("subject_token")
        if not subject_token_type:
            raise MissingRequiredArgumentError("subject_token_type")

        # Validate subject token format (fail fast to ensure token integrity)
        tok = subject_token
        if not isinstance(tok, str) or not tok.strip():
            raise GetTokenByExchangeProfileError("subject_token cannot be blank or whitespace")
        if tok != tok.strip():
            raise GetTokenByExchangeProfileError(
                "subject_token must not include leading or trailing whitespace"
            )
        if tok.lower().startswith("bearer "):
            raise GetTokenByExchangeProfileError(
                "subject_token must not include the 'Bearer ' prefix (case-insensitive check)"
            )

        # Require client credentials
        client_id = self.options.client_id
        client_secret = self.options.client_secret
        if not client_id or not client_secret:
            raise GetTokenByExchangeProfileError(
                "Client credentials are required to use get_token_by_exchange_profile. "
                "Configure client_id and client_secret in ApiClientOptions to use this feature"
            )

        # Discover token endpoint
        metadata = await self._discover()
        token_endpoint = metadata.get("token_endpoint")
        if not token_endpoint:
            raise GetTokenByExchangeProfileError(
                "Token endpoint missing in OIDC metadata. "
                "Verify your domain configuration and that the OIDC discovery endpoint "
                f"(https://{self.options.domain}/.well-known/openid-configuration) is accessible"
            )

        # Build request parameters (client_id sent via HTTP Basic auth only)
        params = {
            "grant_type": TOKEN_EXCHANGE_GRANT_TYPE,
            "subject_token": subject_token,
            "subject_token_type": subject_token_type,
        }

        # Add optional parameters
        if audience:
            params["audience"] = audience
        if scope:
            params["scope"] = scope
        if requested_token_type:
            params["requested_token_type"] = requested_token_type

        # Append extra parameters with validation
        if extra:
            self._apply_extra(params, extra)

        # Make token exchange request
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.options.timeout)) as client:
                response = await client.post(
                    token_endpoint,
                    data=params,
                    auth=(client_id, client_secret)
                )

                if response.status_code != 200:
                    error_data = {}
                    try:
                        # Lenient check for JSON error responses (handles application/json, text/json, etc.)
                        content_type = response.headers.get("content-type", "").lower()
                        if "json" in content_type:
                            error_data = response.json()
                    except ValueError:
                        pass  # Ignore JSON parse errors, use generic error message below

                    raise ApiError(
                        error_data.get("error", "token_exchange_error"),
                        error_data.get(
                            "error_description",
                            f"Failed to exchange token of type '{subject_token_type}'"
                            + (f" for audience '{audience}'" if audience else "")
                        ),
                        response.status_code
                    )

                try:
                    token_response = response.json()
                except ValueError:
                    raise ApiError("invalid_json", "Token endpoint returned invalid JSON.", 502)

                # Validate required fields
                access_token = token_response.get("access_token")
                if not isinstance(access_token, str) or not access_token:
                    raise ApiError(
                        "invalid_response",
                        "Missing or invalid access_token in response.",
                        502
                    )

                # Lenient policy: coerce numeric strings like "3600" to int
                # Reject non-numeric values (e.g., "not-a-number", None, objects)
                # Reject negative values (prevent accidental "already expired" tokens)
                expires_in_raw = token_response.get("expires_in", 3600)
                try:
                    expires_in = int(expires_in_raw)
                except (TypeError, ValueError):
                    raise ApiError("invalid_response", "expires_in is not an integer.", 502)

                if expires_in < 0:
                    raise ApiError("invalid_response", "expires_in cannot be negative.", 502)

                # Build response with required fields
                result = {
                    "access_token": access_token,
                    "expires_in": expires_in,
                    "expires_at": int(time.time()) + expires_in,
                }

                # Add optional fields if present (preserves falsy values like empty scope)
                optional_fields = ["scope", "id_token", "refresh_token", "token_type", "issued_token_type"]
                for field in optional_fields:
                    if field in token_response:
                        result[field] = token_response[field]

                return result

        except httpx.TimeoutException as exc:
            raise ApiError(
                "timeout_error",
                f"Request to token endpoint timed out: {str(exc)}",
                504,
                exc
            )
        except httpx.HTTPError as exc:
            raise ApiError(
                "network_error",
                f"Network error occurred: {str(exc)}",
                502,
                exc
            )

    async def get_token_on_behalf_of(
        self,
        access_token: str,
        audience: str,
        scope: Optional[str] = None,
    ) -> OnBehalfOfTokenResult:
        """
        Exchange an Auth0 access token for another Auth0 access token targeting a downstream API
        while acting on behalf of the same end user (OBO).

        This is a convenience wrapper around get_token_by_exchange_profile() that fixes the
        RFC 8693 token types for Auth0 access-token-to-access-token exchange.

        Args:
            access_token: The Auth0 access token to exchange
            audience: Target API identifier for the exchanged access token
            scope: Optional space-separated OAuth 2.0 scopes to request

        Returns:
            Dictionary containing:
            - access_token (str): The exchanged Auth0 access token
            - expires_in (int): Token lifetime in seconds
            - expires_at (int): Absolute expiration time as a Unix timestamp in seconds, calculated by the SDK from expires_in
            - scope (str, optional): Granted scopes
            - token_type (str, optional): Token type (typically "Bearer")
            - issued_token_type (str, optional): RFC 8693 issued token type identifier

        Raises:
            MissingRequiredArgumentError: If required parameters are missing
            GetTokenByExchangeProfileError: If client credentials are not configured or validation fails
            ApiError: If the token endpoint returns an error
        """
        if not audience:
            raise MissingRequiredArgumentError("audience")

        result = await self.get_token_by_exchange_profile(
            subject_token=access_token,
            subject_token_type=OBO_ACCESS_TOKEN_TYPE,
            audience=audience,
            scope=scope,
            requested_token_type=OBO_ACCESS_TOKEN_TYPE,
        )

        obo_result: OnBehalfOfTokenResult = {
            "access_token": result["access_token"],
            "expires_in": result["expires_in"],
            "expires_at": result["expires_at"],
        }

        if "scope" in result:
            obo_result["scope"] = result["scope"]
        if "token_type" in result:
            obo_result["token_type"] = result["token_type"]
        if "issued_token_type" in result:
            obo_result["issued_token_type"] = result["issued_token_type"]

        return obo_result

    # ===== Private Methods =====

    def _apply_extra(
        self,
        params: dict[str, Any],
        extra: Mapping[str, Union[str, Sequence[str]]]
    ) -> None:
        """
        Apply extra parameters to the params dict with validation.

        Args:
            params: The parameters dict to append to
            extra: Additional parameters to append (accepts str or sequences like list/tuple)

        Raises:
            GetTokenByExchangeProfileError: If reserved parameter, unsupported type, or array size limit exceeded
        """
        # Pre-compute lowercase reserved params for case-insensitive matching
        reserved_lower = {p.lower() for p in RESERVED_PARAMS}

        for k, v in extra.items():
            key = str(k)
            # Case-insensitive check against reserved params
            if key.lower() in reserved_lower:
                raise GetTokenByExchangeProfileError(
                    f"Parameter '{k}' is reserved and cannot be overridden"
                )

            # Handle sequences (list, tuple, etc.) but reject mappings/sets/bytes
            if isinstance(v, (dict, set, bytes)):
                raise GetTokenByExchangeProfileError(
                    f"Parameter '{k}' has unsupported type {type(v).__name__}. "
                    "Only strings, numbers, booleans, and sequences (list/tuple) are allowed"
                )
            elif isinstance(v, (list, tuple)):
                if len(v) > MAX_ARRAY_VALUES_PER_KEY:
                    raise GetTokenByExchangeProfileError(
                        f"Parameter '{k}' exceeds maximum array size of {MAX_ARRAY_VALUES_PER_KEY}"
                    )
                # Convert sequence items to strings
                params[key] = [str(x) for x in v]
            else:
                params[key] = str(v)

    async def _discover(self, issuer: Optional[str] = None) -> dict[str, Any]:
        """
        Lazy-load OIDC discovery metadata.

        Args:
            issuer: Optional issuer URL to fetch discovery from (MCD mode).
                   If provided, extracts domain from issuer URL.
                   If None, uses configured domain.

        Returns:
            OIDC discovery metadata dictionary
        """
        if issuer:
            cache_key = issuer  # Already normalized by caller
            domain = issuer.replace('https://', '').replace('http://', '').rstrip('/')
        else:
            domain = self.options.domain
            cache_key = normalize_domain(f"https://{domain}")

        cached = self._discovery_cache.get(cache_key)
        if cached:
            return cached

        metadata, max_age = await fetch_oidc_metadata(
            domain=domain,
            custom_fetch=self.options.custom_fetch
        )

        effective_ttl = self._cache_ttl
        if max_age is not None and self._cache_ttl is not None:
            effective_ttl = min(max_age, self._cache_ttl)
        elif max_age is not None:
            effective_ttl = max_age

        self._discovery_cache.set(cache_key, metadata, ttl_seconds=effective_ttl)
        return metadata

    async def _fetch_jwks(self, jwks_uri: str) -> dict[str, Any]:
        """
        Fetch JWKS with per-URI caching.

        Args:
            jwks_uri: The JWKS URI to fetch from

        Returns:
            JWKS data dictionary

        """
        cache_key = jwks_uri

        cached = self._jwks_cache.get(cache_key)
        if cached:
            return cached

        jwks_data, max_age = await fetch_jwks(
            jwks_uri=jwks_uri,
            custom_fetch=self.options.custom_fetch
        )

        effective_ttl = self._cache_ttl
        if max_age is not None and self._cache_ttl is not None:
            effective_ttl = min(max_age, self._cache_ttl)
        elif max_age is not None:
            effective_ttl = max_age

        self._jwks_cache.set(cache_key, jwks_data, ttl_seconds=effective_ttl)
        return jwks_data

    def _validate_claims_presence(
        self,
        claims: dict[str, Any],
        required_claims: list[str]
    ) -> None:
        """
        Validates that all required claims are present in the claims dict.

        Args:
            claims: The claims dictionary to validate
            required_claims: List of claim names that must be present

        Raises:
            InvalidDpopProofError: If any required claim is missing
        """
        missing_claims = []

        for claim in required_claims:
            if claim not in claims:
                missing_claims.append(claim)

        if missing_claims:
            if len(missing_claims) == 1:
                error_message = f"Missing required claim: {missing_claims[0]}"
            else:
                error_message = f"Missing required claims: {', '.join(missing_claims)}"

            raise InvalidDpopProofError(error_message)

    def _prepare_error(self, error: BaseAuthError, auth_scheme: Optional[str] = None) -> BaseAuthError:
        """
        Prepare an error with WWW-Authenticate headers based on error type and context.

        Args:
            error: The error to prepare
            auth_scheme: The authentication scheme that was used ("bearer" or "dpop")
        """
        error_code = error.get_error_code()
        error_description = error.get_error_description()

        www_auth_headers = self._build_www_authenticate(
            error_code=error_code,
            error_description=error_description,
            auth_scheme=auth_scheme
        )

        headers = {}
        www_auth_values = []
        for header_name, header_value in www_auth_headers:
            if header_name == "WWW-Authenticate":
                www_auth_values.append(header_value)

        if www_auth_values:
            headers["WWW-Authenticate"] = ", ".join(www_auth_values)

        error._headers = headers

        return error

    def _build_www_authenticate(
        self,
        *,
        error_code: Optional[str] = None,
        error_description: Optional[str] = None,
        auth_scheme: Optional[str] = None
    ) -> list[tuple[str, str]]:
        """
        Returns one or two ('WWW-Authenticate', ...) tuples based on context.
        If dpop_required mode → single DPoP challenge (with optional error params).
        Otherwise → Bearer and/or DPoP challenges based on auth_scheme and error.

        Args:
            error_code: Error code (e.g., "invalid_token", "invalid_request")
            error_description: Error description if any
            auth_scheme: The authentication scheme that was used ("bearer" or "dpop")
        """
        # Check if we should omit error parameters (invalid_request with empty description)
        should_omit_error = (error_code == "invalid_request" and error_description == "")

        # If DPoP is disabled, only return Bearer challenges
        if not self.options.dpop_enabled:
            if error_code and error_code != "unauthorized" and not should_omit_error:
                bearer_parts = []
                bearer_parts.append(f'error="{error_code}"')
                if error_description:
                    bearer_parts.append(f'error_description="{error_description}"')
                return [("WWW-Authenticate", "Bearer " + ", ".join(bearer_parts))]
            return [("WWW-Authenticate", 'Bearer realm="api"')]

        algs = " ".join(self._dpop_algorithms)
        dpop_required = self.is_dpop_required()

        # No error details or should omit error cases
        if error_code == "unauthorized" or not error_code or should_omit_error:
            if dpop_required:
                return [("WWW-Authenticate", f'DPoP algs="{algs}"')]
            return [("WWW-Authenticate", f'Bearer realm="api", DPoP algs="{algs}"')]

        if dpop_required:
            # DPoP-required mode: Single DPoP challenge with error
            dpop_parts = []
            if error_code and not should_omit_error:
                dpop_parts.append(f'error="{error_code}"')
                if error_description:
                    dpop_parts.append(f'error_description="{error_description}"')
            dpop_parts.append(f'algs="{algs}"')
            dpop_header = "DPoP " + ", ".join(dpop_parts)
            return [("WWW-Authenticate", dpop_header)]

        # DPoP-allowed mode: For DPoP errors, always include both challenges
        if auth_scheme == "dpop" and error_code and not should_omit_error:
            bearer_header = 'Bearer realm="api"'
            dpop_parts = []
            dpop_parts.append(f'error="{error_code}"')
            if error_description:
                dpop_parts.append(f'error_description="{error_description}"')
            dpop_parts.append(f'algs="{algs}"')
            dpop_header = "DPoP " + ", ".join(dpop_parts)
            return [
                ("WWW-Authenticate", bearer_header),
                ("WWW-Authenticate", dpop_header),
            ]

        # If auth_scheme is "bearer", include error on Bearer challenge
        if auth_scheme == "bearer" and error_code and not should_omit_error:
            bearer_parts = []
            bearer_parts.append(f'error="{error_code}"')
            if error_description:
                bearer_parts.append(f'error_description="{error_description}"')
            bearer_header = "Bearer " + ", ".join(bearer_parts)
            dpop_header = f'DPoP algs="{algs}"'
            return [("WWW-Authenticate", f'{bearer_header}, {dpop_header}')]

        # Default: no error or should omit error context
        return [
            ("WWW-Authenticate", 'Bearer realm="api"'),
            ("WWW-Authenticate", f'DPoP algs="{algs}"'),
        ]
