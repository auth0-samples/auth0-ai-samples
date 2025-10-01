from contextlib import asynccontextmanager, contextmanager
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest
from auth0_ai_langchain import FGARetriever
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


def create_test_data(num_docs=2):
    """Create test documents and check requests."""
    docs = [
        MagicMock(spec=Document, id=i, page_content=f"content_{i}")
        for i in range(num_docs)
    ]
    check_requests = [
        MagicMock(spec=ClientBatchCheckItem,
                  tuple_key=f"check_{i}", object=f"doc:{i}")
        for i in range(num_docs)
    ]
    return docs, check_requests


def verify_query_builder_calls(mock_query_builder, docs):
    """Verify query builder was called correctly for each document."""
    assert mock_query_builder.call_count == len(docs)
    for doc, call_args in zip(docs, mock_query_builder.call_args_list):
        assert call_args == call(doc)


def verify_batch_check_calls(mock_batch_check, check_requests):
    """Verify batch_check was called with correct requests."""
    mock_batch_check.assert_called_once()
    called_args = mock_batch_check.call_args
    assert called_args[0][0].checks == check_requests


@pytest.mark.asyncio
async def test_async_query_builder_integration(
    fga_retriever,
    mock_query_builder,
    mock_retriever,
    mock_fga_configuration,
):
    # Setup
    query = "test_query"
    run_manager = MagicMock()
    docs, check_requests = create_test_data()

    # Configure mocks
    mock_query_builder.side_effect = check_requests
    mock_retriever._aget_relevant_documents = AsyncMock(return_value=docs)

    mock_results = MagicMock(
        result=[
            MagicMock(
                allowed=True,
                request=MagicMock(spec=ClientBatchCheckItem,
                                  object=f"doc:{i}"),
            )
            for i in range(2)
        ]
    )
    mock_batch_check = AsyncMock(return_value=mock_results)

    @asynccontextmanager
    async def mock_client(*args, **kwargs):
        mock = AsyncMock()
        mock.batch_check = mock_batch_check
        yield mock

    # Execute
    with patch("auth0_ai_langchain.FGARetriever.OpenFgaClient", mock_client):
        await fga_retriever._aget_relevant_documents(query, run_manager=run_manager)

        # Verify behaviors
        verify_query_builder_calls(mock_query_builder, docs)
        verify_batch_check_calls(mock_batch_check, check_requests)


def test_sync_query_builder_integration(
    fga_retriever,
    mock_query_builder,
    mock_retriever,
    mock_fga_configuration,
):
    # Setup
    query = "test_query"
    run_manager = MagicMock()
    docs, check_requests = create_test_data()

    # Configure mocks
    mock_query_builder.side_effect = check_requests
    mock_retriever._get_relevant_documents.return_value = docs
    mock_results = MagicMock(
        result=[
            MagicMock(
                allowed=True,
                request=MagicMock(spec=ClientBatchCheckItem,
                                  object=f"doc:{i}"),
            )
            for i in range(2)
        ]
    )
    mock_batch_check = MagicMock(return_value=mock_results)

    @contextmanager
    def mock_client(*args, **kwargs):
        mock = MagicMock()
        mock.batch_check = mock_batch_check
        yield mock

    # Execute
    with patch("auth0_ai_langchain.FGARetriever.OpenFgaClientSync", mock_client):
        fga_retriever._get_relevant_documents(query, run_manager=run_manager)

        # Verify behaviors
        verify_query_builder_calls(mock_query_builder, docs)
        verify_batch_check_calls(mock_batch_check, check_requests)
