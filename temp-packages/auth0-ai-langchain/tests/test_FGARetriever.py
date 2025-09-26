from contextlib import asynccontextmanager, contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from auth0_ai_langchain.FGARetriever import FGARetriever
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from openfga_sdk import ClientConfiguration
from openfga_sdk.client.models import ClientBatchCheckItem


@pytest.fixture
def mock_retriever():
    return MagicMock(spec=BaseRetriever)


@pytest.fixture
def mock_fga_configuration():
    mock = MagicMock(spec=ClientConfiguration)
    mock.connection_pool_maxsize = 10
    return mock


@pytest.fixture
def mock_query_builder():
    return MagicMock()


@pytest.fixture
def fga_retriever(mock_retriever, mock_fga_configuration, mock_query_builder):
    return FGARetriever(
        retriever=mock_retriever,
        fga_configuration=mock_fga_configuration,
        build_query=mock_query_builder,
    )


test_cases = [
    ("normal_case", [True, False, True], 3, 2),
    ("all_denied", [False, False, False], 3, 0),
    ("all_allowed", [True, True, True], 3, 3),
    ("empty_list", [], 0, 0),
    ("single_allowed", [True], 1, 1),
    ("single_denied", [False], 1, 0),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("test_name,allowed_flags,doc_count,expected_count", test_cases)
async def test_async_get_relevant_docs(
    fga_retriever,
    mock_query_builder,
    mock_retriever,
    mock_fga_configuration,
    test_name,
    allowed_flags,
    doc_count,
    expected_count,
):
    query = "test_query"
    run_manager = MagicMock()
    docs = [MagicMock(spec=Document, id=i) for i in range(doc_count)]
    mock_query_builder.side_effect = [
        MagicMock(spec=ClientBatchCheckItem, object=f"doc:{i}")
        for i in range(doc_count)
    ]
    mock_results = MagicMock(
        result=[
            MagicMock(
                allowed=x,
                request=MagicMock(spec=ClientBatchCheckItem,
                                  object=f"doc:{i}"),
            )
            for i, x in enumerate(allowed_flags)
        ]
    )

    mock_retriever._aget_relevant_documents = AsyncMock(return_value=docs)
    mock_client_constructor = MagicMock()

    @asynccontextmanager
    async def mock_client(*args, **kwargs):
        mock_client_constructor(*args, **kwargs)
        mock = AsyncMock()
        mock.batch_check.return_value = mock_results
        yield mock

    with patch("auth0_ai_langchain.FGARetriever.OpenFgaClient", mock_client):
        filtered_docs = await fga_retriever._aget_relevant_documents(
            query, run_manager=run_manager
        )
        assert len(filtered_docs) == expected_count
        mock_client_constructor.assert_called_once_with(mock_fga_configuration)


@pytest.mark.parametrize("test_name,allowed_flags,doc_count,expected_count", test_cases)
def test_get_relevant_docs(
    fga_retriever,
    mock_query_builder,
    mock_retriever,
    mock_fga_configuration,
    test_name,
    allowed_flags,
    doc_count,
    expected_count,
):
    query = "test_query"
    run_manager = MagicMock()
    docs = [MagicMock(spec=Document, id=i) for i in range(doc_count)]
    mock_query_builder.side_effect = [
        MagicMock(spec=ClientBatchCheckItem, object=f"doc:{i}")
        for i in range(doc_count)
    ]
    mock_results = MagicMock(
        result=[
            MagicMock(
                allowed=x,
                request=MagicMock(spec=ClientBatchCheckItem,
                                  object=f"doc:{i}"),
            )
            for i, x in enumerate(allowed_flags)
        ]
    )

    mock_retriever._get_relevant_documents.return_value = docs
    mock_client_constructor = MagicMock()

    @contextmanager
    def mock_client(*args, **kwargs):
        mock_client_constructor(*args, **kwargs)
        mock = MagicMock()
        mock.batch_check.return_value = mock_results
        yield mock

    with patch("auth0_ai_langchain.FGARetriever.OpenFgaClientSync", mock_client):
        filtered_docs = fga_retriever._get_relevant_documents(
            query, run_manager=run_manager
        )
        assert len(filtered_docs) == expected_count
        mock_client_constructor.assert_called_once_with(mock_fga_configuration)
