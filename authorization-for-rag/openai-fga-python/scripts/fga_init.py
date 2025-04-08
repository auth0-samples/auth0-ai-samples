"""
This initializes the FGA store with the necessary tuple data
it will use the openfga_sdk and read the configuration from the .config file
"""
import asyncio
# import the configuration from the helpers/config.py file
from helpers.config import config
from openfga_sdk import ClientConfiguration, OpenFgaClient
from openfga_sdk.credentials import Credentials, CredentialConfiguration
from openfga_sdk.client.models import ClientTuple, ClientWriteRequest


async def fga_setup(config):
    fga_config = ClientConfiguration(
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

    fga_client = OpenFgaClient(fga_config)
    return fga_client


async def main():
    fga_client = await fga_setup(config)
    tuple_data = {"user":"user:jess", "relation":"viewer", "object":"doc:public-doc"}
    body = ClientWriteRequest(writes=[ ClientTuple(**tuple_data) ])
    await fga_client.write(body)
    await fga_client.close()


if __name__ == "__main__":
    asyncio.run(main())