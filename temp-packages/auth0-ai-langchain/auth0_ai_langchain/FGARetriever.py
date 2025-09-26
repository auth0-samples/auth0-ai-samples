import os

from typing import Callable, Optional
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from openfga_sdk.client.client import ClientBatchCheckRequest
from pydantic import PrivateAttr
from openfga_sdk import ClientConfiguration, OpenFgaClient
from openfga_sdk.client.models import ClientBatchCheckItem
from openfga_sdk.sync import OpenFgaClient as OpenFgaClientSync
from openfga_sdk.credentials import CredentialConfiguration, Credentials


class FGARetriever(BaseRetriever):
    """
    FGARetriever integrates with OpenFGA to filter documents based on fine-grained authorization (FGA).
    """

    _retriever: BaseRetriever = PrivateAttr()
    _fga_configuration: ClientConfiguration = PrivateAttr()
    _query_builder: Callable[[Document], ClientBatchCheckItem] = PrivateAttr()

    def __init__(
        self,
        retriever: BaseRetriever,
        build_query: Callable[[Document], ClientBatchCheckItem],
        fga_configuration: Optional[ClientConfiguration] = None,
    ):
        """
        Initialize the FGARetriever with the specified retriever, query builder, and configuration.

        Args:
            retriever (BaseRetriever): The retriever used to fetch documents.
            build_query (Callable[[Document], ClientBatchCheckItem]): Function to convert documents into FGA queries.
            fga_configuration (ClientConfiguration, optional): Configuration for the OpenFGA client. If not provided, defaults to environment variables.
        """
        super().__init__()
        self._retriever = retriever
        self._fga_configuration = fga_configuration or ClientConfiguration(
            api_url=os.getenv("FGA_API_URL") or "https://api.us1.fga.dev",
            store_id=os.getenv("FGA_STORE_ID"),
            credentials=Credentials(
                method="client_credentials",
                configuration=CredentialConfiguration(
                    api_issuer=os.getenv("FGA_API_TOKEN_ISSUER") or "auth.fga.dev",
                    api_audience=os.getenv("FGA_API_AUDIENCE")
                    or "https://api.us1.fga.dev/",
                    client_id=os.getenv("FGA_CLIENT_ID"),
                    client_secret=os.getenv("FGA_CLIENT_SECRET"),
                ),
            ),
        )
        self._query_builder = build_query

    async def _async_filter_FGA(self, docs: list[Document]) -> list[Document]:
        """
        Asynchronously filter documents using OpenFGA.

        Args:
            docs (List[Document]): List of documents to filter.

        Returns:
            List[Document]: Filtered list of documents authorized by FGA.
        """
        async with OpenFgaClient(self._fga_configuration) as fga_client:
            all_checks = [self._query_builder(doc) for doc in docs]
            unique_checks = list(
                {
                    (check.relation, check.object, check.user): check
                    for check in all_checks
                }.values()
            )

            doc_to_obj = {doc: check.object for check, doc in zip(all_checks, docs)}

            fga_response = await fga_client.batch_check(
                ClientBatchCheckRequest(checks=unique_checks)
            )
            await fga_client.close()

            permissions_map = {
                result.request.object: result.allowed for result in fga_response.result
            }

            return [
                doc
                for doc in docs
                if doc_to_obj[doc] in permissions_map
                and permissions_map[doc_to_obj[doc]]
            ]

    async def _aget_relevant_documents(self, query, *, run_manager) -> list[Document]:
        """
        Asynchronously retrieve relevant documents from the base retrieve and filter them using FGA.

        Args:
            query (str): The query for retrieving documents.
            run_manager (object, optional): Optional manager for tracking runs.

        Returns:
            List[Document]: Filtered and relevant documents.
        """
        docs = await self._retriever._aget_relevant_documents(
            query, run_manager=run_manager
        )
        docs = await self._async_filter_FGA(docs)
        return docs

    def _filter_FGA(self, docs: list[Document]) -> list[Document]:
        """
        Synchronously filter documents using OpenFGA.

        Args:
            docs (List[Document]): List of documents to filter.

        Returns:
            List[Document]: Filtered list of documents authorized by FGA.
        """
        with OpenFgaClientSync(self._fga_configuration) as fga_client:
            all_checks = [self._query_builder(doc) for doc in docs]
            unique_checks = list(
                {
                    (check.relation, check.object, check.user): check
                    for check in all_checks
                }.values()
            )

            doc_to_obj = {doc.id: check.object for check, doc in zip(all_checks, docs)}

            fga_response = fga_client.batch_check(
                ClientBatchCheckRequest(checks=unique_checks)
            )

            permissions_map = {
                result.request.object: result.allowed for result in fga_response.result
            }

            return [
                doc
                for doc in docs
                if doc_to_obj[doc.id] in permissions_map
                and permissions_map[doc_to_obj[doc.id]]
            ]

    def _get_relevant_documents(self, query, *, run_manager) -> list[Document]:
        """
        Retrieve relevant documents and filter them using FGA.

        Args:
            query (str): The query for retrieving documents.
            run_manager (object, optional): Optional manager for tracking runs.

        Returns:
            List[Document]: Filtered and relevant documents.
        """
        docs = self._retriever._get_relevant_documents(query, run_manager=run_manager)
        docs = self._filter_FGA(docs)
        return docs
