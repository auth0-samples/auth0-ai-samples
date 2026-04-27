import pytest

from auth0_api_python import get_current_actor, get_delegation_chain
from auth0_api_python.errors import VerifyAccessTokenError

INVALID_ACT_CLAIM_MESSAGE = "Invalid act claim"


def test_get_current_actor_returns_none_when_act_is_missing():
    claims = {"sub": "auth0|user123"}

    assert get_current_actor(claims) is None
    assert get_delegation_chain(claims) == []


def test_get_current_actor_and_delegation_chain_from_nested_act():
    claims = {
        "sub": "auth0|user123",
        "act": {
            "sub": "mcp_server_2_client_id",
            "act": {
                "sub": "mcp_server_1_client_id",
                "act": {
                    "sub": "spa_client_id",
                },
            },
        },
    }

    assert get_current_actor(claims) == "mcp_server_2_client_id"
    assert get_delegation_chain(claims) == [
        "mcp_server_2_client_id",
        "mcp_server_1_client_id",
        "spa_client_id",
    ]


def test_get_current_actor_rejects_blank_actor_subject():
    with pytest.raises(
        VerifyAccessTokenError,
        match=INVALID_ACT_CLAIM_MESSAGE,
    ):
        get_current_actor({"act": {"sub": "   "}})


def test_get_delegation_chain_rejects_invalid_nested_act():
    with pytest.raises(
        VerifyAccessTokenError,
        match=INVALID_ACT_CLAIM_MESSAGE,
    ):
        get_delegation_chain(
            {
                "act": {
                    "sub": "mcp_server_client_id",
                    "act": "spa_client_id",
                },
            }
        )
