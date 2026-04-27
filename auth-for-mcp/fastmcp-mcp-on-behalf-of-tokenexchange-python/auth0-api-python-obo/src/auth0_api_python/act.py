"""
Helpers for working with the `act` claim on verified access token claims.
"""

from collections.abc import Mapping
from typing import Any, Optional

from .errors import VerifyAccessTokenError

INVALID_ACT_CLAIM_MESSAGE = "Invalid act claim"


def get_current_actor(claims: Mapping[str, Any]) -> Optional[str]:
    """
    Return the current actor from the outermost `act.sub`, if present.

    Only the outermost `act.sub` should be used for authorization decisions.
    Nested `act` values represent prior actors and are informational.
    """
    if not isinstance(claims, Mapping):
        raise VerifyAccessTokenError(INVALID_ACT_CLAIM_MESSAGE)

    act_claim = claims.get("act")
    if act_claim is None:
        return None

    if not isinstance(act_claim, Mapping):
        raise VerifyAccessTokenError(INVALID_ACT_CLAIM_MESSAGE)

    sub = act_claim.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise VerifyAccessTokenError(INVALID_ACT_CLAIM_MESSAGE)

    return sub


def get_delegation_chain(claims: Mapping[str, Any]) -> list[str]:
    """
    Return the delegation chain from newest actor to oldest actor.

    The first entry is the current actor (outermost `act.sub`). Later entries are
    prior actors from nested `act` values and are typically most useful for audit
    and attribution.
    """
    if not isinstance(claims, Mapping):
        raise VerifyAccessTokenError(INVALID_ACT_CLAIM_MESSAGE)

    current = claims.get("act")
    if current is None:
        return []

    chain: list[str] = []
    while current is not None:
        if not isinstance(current, Mapping):
            raise VerifyAccessTokenError(INVALID_ACT_CLAIM_MESSAGE)

        sub = current.get("sub")
        if not isinstance(sub, str) or not sub.strip():
            raise VerifyAccessTokenError(INVALID_ACT_CLAIM_MESSAGE)

        chain.append(sub)
        current = current.get("act")

    return chain
