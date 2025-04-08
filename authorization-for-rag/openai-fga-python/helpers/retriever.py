from dataclasses import dataclass
from typing import List, Callable, Dict, Any
from openfga_sdk import ClientConfiguration, OpenFgaClient
from openfga_sdk.credentials import CredentialConfiguration, Credentials
from openfga_sdk.client.models import ClientBatchCheckItem, ClientBatchCheckRequest
from helpers.documents import Document, DocumentWithScore
from helpers.config import config


@dataclass
class FGARetrieverArgs:
    build_query: Callable[[Document], ClientBatchCheckItem]
    documents: List[DocumentWithScore]


class FGARetriever:
    def __init__(self, args: FGARetrieverArgs):
        self.documents = args.documents
        self.build_query = args.build_query
        self._fga_configuration = ClientConfiguration(
            api_url=config["AUTH0FGA"]["FGA_API_URL"],
            store_id=config["AUTH0FGA"]["FGA_STORE_ID"],
            credentials=Credentials(
                method="client_credentials",
                configuration=CredentialConfiguration(
                    api_issuer=config["AUTH0FGA"]["FGA_API_TOKEN_ISSUER"],
                    api_audience=config["AUTH0FGA"]["FGA_API_AUDIENCE"],
                    client_id=config["AUTH0FGA"]["FGA_CLIENT_ID"],
                    client_secret=config["AUTH0FGA"]["FGA_CLIENT_SECRET"],
                )
            )
        )
        self.fga_client = OpenFgaClient(self._fga_configuration)

    @classmethod
    def create(cls, options: Dict[str, Any]):
        return cls(
            FGARetrieverArgs(
                build_query=options["build_query"],
                documents=options["documents"]
            )
        )

    async def check_permissions(self, checks: List[ClientBatchCheckItem]) -> Dict[str, bool]:
        try:
            responses = await self.fga_client.batch_check(
                ClientBatchCheckRequest(checks=checks)
            )

            # Create a dictionary comprehension for document IDs
            results = {doc.document["id"]: False for doc in self.documents}

            for response in responses.result:
                doc_id = response.request.object.split(":")[-1]  # Assuming object format contains ID after ":"
                if doc_id in results:
                    results[doc_id] = response.allowed

            return results
        except Exception as e:
            print(f"Error checking permissions: {e}")
            return {}

    async def retrieve(self) -> List[DocumentWithScore]:
        batch_check_requests = [
            ClientBatchCheckItem(**self.build_query(doc.document)) for doc in self.documents
        ]

        if not batch_check_requests:
            return []

        permissions_map = await self.check_permissions(batch_check_requests)
        
        await self.fga_client.close()
        
        result = [
            doc for doc in self.documents
            if permissions_map.get(doc.document['id'], False)
        ]
        
        return result