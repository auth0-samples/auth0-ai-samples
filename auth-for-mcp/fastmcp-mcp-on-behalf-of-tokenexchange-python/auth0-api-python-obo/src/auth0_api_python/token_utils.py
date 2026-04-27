import time
import uuid
from typing import Any, Optional, Union

from authlib.jose import JsonWebKey, jwt

from .utils import calculate_jwk_thumbprint, normalize_url_for_htu, sha256_base64url

# A private RSA JWK for test usage.

PRIVATE_JWK = {
    "kty": "RSA",
    "alg": "RS256",
    "use": "sig",
    "kid": "TEST_KEY",
    "n": "whYOFK2Ocbbpb_zVypi9SeKiNUqKQH0zTKN1-6fpCTu6ZalGI82s7XK3tan4dJt90ptUPKD2zvxqTzFNfx4HHHsrYCf2-FMLn1VTJfQazA2BvJqAwcpW1bqRUEty8tS_Yv4hRvWfQPcc2Gc3-_fQOOW57zVy-rNoJc744kb30NjQxdGp03J2S3GLQu7oKtSDDPooQHD38PEMNnITf0pj-KgDPjymkMGoJlO3aKppsjfbt_AH6GGdRghYRLOUwQU-h-ofWHR3lbYiKtXPn5dN24kiHy61e3VAQ9_YAZlwXC_99GGtw_NpghFAuM4P1JDn0DppJldy3PGFC0GfBCZASw",
    "e": "AQAB",
    "d": "VuVE_KEP6323WjpbBdAIv7HGahGrgGANvbxZsIhm34lsVOPK0XDegZkhAybMZHjRhp-gwVxX5ChC-J3cUpOBH5FNxElgW6HizD2Jcq6t6LoLYgPSrfEHm71iHg8JsgrqfUnGYFzMJmv88C6WdCtpgG_qJV1K00_Ly1G1QKoBffEs-v4fAMJrCbUdCz1qWto-PU-HLMEo-krfEpGgcmtZeRlDADh8cETMQlgQfQX2VWq_aAP4a1SXmo-j0cvRU4W5Fj0RVwNesIpetX2ZFz4p_JmB5sWFEj_fC7h5z2lq-6Bme2T3BHtXkIxoBW0_pYVnASC8P2puO5FnVxDmWuHDYQ",
    "p": "07rgXd_tLUhVRF_g1OaqRZh5uZ8hiLWUSU0vu9coOaQcatSqjQlIwLW8UdKv_38GrmpIfgcEVQjzq6rFBowUm9zWBO9Eq6enpasYJBOeD8EMeDK-nsST57HjPVOCvoVC5ZX-cozPXna3iRNZ1TVYBY3smn0IaxysIK-zxESf4pM",
    "q": "6qrE9TPhCS5iNR7QrKThunLu6t4H_8CkYRPLbvOIt2MgZyPLiZCsvdkTVSOX76QQEXt7Y0nTNua69q3K3Jhf-YOkPSJsWTxgrfOnjoDvRKzbW3OExIMm7D99fVBODuNWinjYgUwGSqGAsb_3TKhtI-Gr5ls3fn6B6oEjVL0dpmk",
    "dp": "mHqjrFdgelT2OyiFRS3dAAPf3cLxJoAGC4gP0UoQyPocEP-Y17sQ7t-ygIanguubBy65iDFLeGXa_g0cmSt2iAzRAHrDzI8P1-pQl2KdWSEg9ssspjBRh_F_AiJLLSPRWn_b3-jySkhawtfxwO8Kte1QsK1My765Y0zFvJnjPws",
    "dq": "KmjaV4YcsVAUp4z-IXVa5htHWmLuByaFjpXJOjABEUN0467wZdgjn9vPRp-8Ia8AyGgMkJES_uUL_PDDrMJM9gb4c6P4-NeUkVtreLGMjFjA-_IQmIMrUZ7XywHsWXx0c2oLlrJqoKo3W-hZhR0bPFTYgDUT_mRWjk7wV6wl46E",
    "qi": "iYltkV_4PmQDfZfGFpzn2UtYEKyhy-9t3Vy8Mw2VHLAADKGwJvVK5ficQAr2atIF1-agXY2bd6KV-w52zR8rmZfTr0gobzYIyqHczOm13t7uXJv2WygY7QEC2OGjdxa2Fr9RnvS99ozMa5nomZBqTqT7z5QV33czjPRCjvg6FcE",
}


async def generate_token(
    domain: str,
    user_id: str,
    audience: Optional[str] = None,
    issuer: Union[str, bool, None] = None,
    iat: bool = True,
    exp: bool = True,
    claims: Optional[dict[str, Any]] = None,
    expiration_time: int = 3600,
) -> str:
    """
    Generates a real RS256-signed JWT using the private key above.

    Args:
        domain: The Auth0 domain (used if issuer is not False).
        user_id: The 'sub' claim in the token.
        audience: The 'aud' claim in the token. If omitted, 'aud' won't be included.
        issuer:
            - If a string, it's placed in 'iss' claim.
            - If None, default is f"https://{domain}/".
            - If False, skip 'iss' claim entirely.
        iat: Whether to set the 'iat' (issued at) claim. If False, skip it.
        exp: Whether to set the 'exp' claim. If False, skip it.
        claims: Additional custom claims to merge into the token.
        expiration_time: If exp is True, how many seconds from now until expiration.

    Returns:
        A RS256-signed JWT string.

    Example usage:
        token = generate_token(
            domain="example.us.auth0.com",
            user_id="user123",
            audience="my-api",
            issuer=False,
            iat=False,
            exp=False,
            claims={"scope": "read:stuff"}
        )
    """
    token_claims = dict(claims or {})
    token_claims.setdefault("sub", user_id)

    if iat:
        token_claims["iat"] = int(time.time())

    if exp:
        token_claims["exp"] = int(time.time()) + expiration_time

    if issuer is not False:
        token_claims["iss"] = issuer if isinstance(issuer, str) else f"https://{domain}/"

    if audience:
        token_claims["aud"] = audience


    key = JsonWebKey.import_key(PRIVATE_JWK)

    header = {"alg": "RS256", "kid": PRIVATE_JWK["kid"]}
    token = jwt.encode(header, token_claims, key)
    # Ensure we return a string, not bytes
    return token.decode('utf-8') if isinstance(token, bytes) else token


# A private EC P-256 private key for DPoP proof generation (test only)
PRIVATE_EC_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "x": "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
    "y": "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
    "d": "870MB6gfuTJ4HtUnUvYMyJpr5eUZNP4Bk43bVdj3eAE"
}


async def generate_dpop_proof(
    access_token: str,
    http_method: str,
    http_url: str,
    jti: Optional[str] = None,
    iat: bool = True,
    claims: Optional[dict[str, Any]] = None,
    header_overrides: Optional[dict[str, Any]] = None,
    iat_time: Optional[int] = None,
    include_jti: bool = True
) -> str:
    """
    Generates a real ES256-signed DPoP proof JWT using the EC private key above.

    Args:
        access_token: The access token to create proof for (used for ath claim).
        http_method: The HTTP method (e.g., "GET", "POST") for htm claim.
        http_url: The HTTP URL for htu claim.
        jti: The unique identifier for the proof. If omitted, generates random UUID.
        iat: Whether to set the 'iat' (issued at) claim. If False, skip it.
        claims: Additional custom claims to merge into the proof.
        header_overrides: Override header parameters (e.g., for testing invalid headers).
        iat_time: Fixed time for iat claim (for testing). If None, uses current time.
        include_jti: Whether to include the 'jti' claim. If False, jti is completely omitted.

    Returns:
        An ES256-signed DPoP proof JWT string.

    Example usage:
        proof = await generate_dpop_proof(
            access_token="eyJ...",
            http_method="GET",
            http_url="https://api.example.com/resource",
            iat=False,  # Skip iat for testing
            claims={"custom": "claim"}
        )
    """


    proof_claims = dict(claims or {})

    if iat:
        proof_claims["iat"] = iat_time if iat_time is not None else int(time.time())

    if include_jti:
        if jti is not None:
            proof_claims["jti"] = jti
        else:
            proof_claims["jti"] = str(uuid.uuid4())

    proof_claims["htm"] = http_method
    proof_claims["htu"] = normalize_url_for_htu(http_url)
    proof_claims["ath"] = sha256_base64url(access_token)


    public_jwk = {k: v for k, v in PRIVATE_EC_JWK.items() if k != "d"}


    header = {
        "alg": "ES256",
        "typ": "dpop+jwt",
        "jwk": public_jwk
    }


    if header_overrides:
        header.update(header_overrides)

    key = JsonWebKey.import_key(PRIVATE_EC_JWK)
    token = jwt.encode(header, proof_claims, key)
    # Ensure we return a string, not bytes
    return token.decode('utf-8') if isinstance(token, bytes) else token


async def generate_token_with_cnf(
    domain: str,
    user_id: str,
    audience: str,
    jkt_thumbprint: Optional[str] = None,
    **kwargs
) -> str:
    """
    Generates an access token with cnf (confirmation) claim for DPoP binding.
    Extends the existing generate_token() function with DPoP support.

    Args:
        domain: The Auth0 domain (used if issuer is not False).
        user_id: The 'sub' claim in the token.
        audience: The 'aud' claim in the token.
        jkt_thumbprint: JWK thumbprint to include in cnf claim. If None, calculates from PRIVATE_EC_JWK.
        **kwargs: Additional arguments passed to generate_token().

    Returns:
        A RS256-signed JWT string with cnf claim.

    Example usage:
        token = await generate_token_with_cnf(
            domain="auth0.local",
            user_id="user123",
            audience="my-api",
            jkt_thumbprint="custom_thumbprint"
        )
    """


    if jkt_thumbprint is None:
        jkt_thumbprint = calculate_jwk_thumbprint(PRIVATE_EC_JWK)


    existing_claims = kwargs.get('claims', {})
    cnf_claims = dict(existing_claims)
    cnf_claims["cnf"] = {"jkt": jkt_thumbprint}
    kwargs['claims'] = cnf_claims


    return await generate_token(
        domain=domain,
        user_id=user_id,
        audience=audience,
        **kwargs
    )
