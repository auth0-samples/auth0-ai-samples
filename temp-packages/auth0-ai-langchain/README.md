# Auth0 AI for LangChain

`auth0-ai-langchain` is an SDK for building secure AI-powered applications using [Auth0](https://www.auth0.ai/), [Okta FGA](https://docs.fga.dev/) and [LangChain](https://python.langchain.com/docs/tutorials/).

![Release](https://img.shields.io/pypi/v/auth0-ai-langchain) ![Downloads](https://img.shields.io/pypi/dw/auth0-ai-langchain) [![License](https://img.shields.io/:license-APACHE%202.0-blue.svg?style=flat)](https://opensource.org/license/apache-2-0)

## Installation

> ⚠️ **WARNING**: `auth0-ai-langchain` is currently under development and it is not intended to be used in production, and therefore has no official support.

```bash
pip install auth0-ai-langchain
```

## Async Authorization

`Auth0AI` uses CIBA (Client-Initiated Backchannel Authentication) to handle user confirmation asynchronously. This is useful when you need to confirm a user action before proceeding with a tool execution.

Full Example of [Async Authorization](https://github.com/auth0-lab/auth0-ai-python/tree/main/examples/async-authorization/langchain-examples).

1. Define a tool with the proper authorizer specifying a function to resolve the user id:

```python
from auth0_ai_langchain.auth0_ai import Auth0AI
from auth0_ai_langchain.async_authorization import get_async_authorization_credentials
from langchain_core.runnables import ensure_config
from langchain_core.tools import StructuredTool

# If not provided, Auth0 settings will be read from env variables: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET`
auth0_ai = Auth0AI()

with_async_authorization = auth0_ai.with_async_authorization(
    scopes=["stock:trade"],
    audience=os.getenv("AUDIENCE"),
    binding_message=lambda ticker, qty: f"Authorize the purchase of {qty} {ticker}",
    user_id=lambda *_, **__: ensure_config().get("configurable", {}).get("user_id"),
    # Optional:
    # store=InMemoryStore()
)

def tool_function(ticker: str, qty: int) -> str:
    credentials = get_async_authorization_credentials()
    headers = {
        "Authorization": f"{credentials["token_type"]} {credentials["access_token"]}",
        # ...
    }
    # Call API

trade_tool = with_async_authorization(
    StructuredTool(
        name="trade_tool",
        description="Use this function to trade a stock",
        func=trade_tool_function,
        # ...
    )
)
```

2. Handle interruptions properly. For example, if user is not enrolled to MFA, it will throw an interruption. See [Handling Interrupts](#handling-interrupts) section.

### Async Authorization with RAR (Rich Authorization Requests)

`Auth0AI` supports RAR (Rich Authorization Requests) for CIBA. This allows you to provide additional authorization parameters to be displayed during the user confirmation request.

When defining the tool authorizer, you can specify the `authorization_details` parameter to include detailed information about the authorization being requested:

```python
with_async_authorization = auth0_ai.with_async_authorization(
    scopes=["stock:trade"],
    audience=os.getenv("AUDIENCE"),
    binding_message=lambda ticker, qty: f"Authorize the purchase of {qty} {ticker}",
    authorization_details=lambda ticker, qty: [
        {
            "type": "trade_authorization",
            "qty": qty,
            "ticker": ticker,
            "action": "buy"
        }
    ],
    user_id=lambda *_, **__: ensure_config().get("configurable", {}).get("user_id"),
    # Optional:
    # store=InMemoryStore()
)
```

To use RAR with CIBA, you need to [set up authorization details](https://auth0.com/docs/get-started/apis/configure-rich-authorization-requests) in your Auth0 tenant. This includes defining the authorization request parameters and their types. Additionally, the [Guardian SDK](https://auth0.com/docs/secure/multi-factor-authentication/auth0-guardian) is required to handle these authorization details in your authorizer app.

For more information on setting up RAR with CIBA, refer to:

- [Configure Rich Authorization Requests (RAR)](https://auth0.com/docs/get-started/apis/configure-rich-authorization-requests)
- [User Authorization with CIBA](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-initiated-backchannel-authentication-flow/user-authorization-with-ciba)

## Authorization for Tools

The `FGAAuthorizer` can leverage Okta FGA to authorize tools executions. The `FGAAuthorizer.create` function can be used to create an authorizer that checks permissions before executing the tool.

Full example of [Authorization for Tools](https://github.com/auth0-lab/auth0-ai-python/tree/main/examples/authorization-for-tools/langchain-examples).

1. Create an instance of FGA Authorizer:

```python
from auth0_ai_langchain.fga import FGAAuthorizer

# If not provided, FGA settings will be read from env variables: `FGA_STORE_ID`, `FGA_CLIENT_ID`, `FGA_CLIENT_SECRET`, etc.
fga = FGAAuthorizer.create()
```

2. Define the FGA query (`build_query`) and, optionally, the `on_unauthorized` handler:

```python
from langchain_core.runnables import ensure_config

async def build_fga_query(tool_input):
    user_id = ensure_config().get("configurable",{}).get("user_id")
    return {
        "user": f"user:{user_id}",
        "object": f"asset:{tool_input["ticker"]}",
        "relation": "can_buy",
        "context": {"current_time": datetime.now(timezone.utc).isoformat()}
    }

def on_unauthorized(tool_input):
    return f"The user is not allowed to buy {tool_input["qty"]} shares of {tool_input["ticker"]}."

use_fga = fga(
    build_query=build_fga_query,
    on_unauthorized=on_unauthorized,
)
```

**Note**: The parameters given to the `build_query` and `on_unauthorized` functions are the same as those provided to the tool function.

3. Wrap the tool:

```python
from langchain_core.tools import StructuredTool

async def buy_tool_function(ticker: str, qty: int) -> str:
    # TODO: implement buy operation
    return f"Purchased {qty} shares of {ticker}"

func=use_fga(buy_tool_function)

buy_tool = StructuredTool(
    func=func,
    coroutine=func,
    name="buy",
    description="Use this function to buy stocks",
)
```

## Calling APIs On User's Behalf

The `Auth0AI.with_token_vault` function exchanges user's refresh token taken, by default, from the runnable configuration (`config.configurable._credentials.refresh_token`) for a Token Vault access token that is valid to call a third-party API.

Full Example of [Calling APIs On User's Behalf](https://github.com/auth0-lab/auth0-ai-python/tree/main/examples/calling-apis/langchain-examples).

1. Define a tool with the proper authorizer:

```python
from auth0_ai_langchain.auth0_ai import Auth0AI
from auth0_ai_langchain.token_vault import get_credentials_from_token_vault
from langchain_core.tools import StructuredTool

# If not provided, Auth0 settings will be read from env variables: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET`
auth0_ai = Auth0AI()

with_google_calendar_access = auth0_ai.with_token_vault(
    connection="google-oauth2",
    scopes=["https://www.googleapis.com/auth/calendar.freebusy"],
    # Optional:
    # refresh_token=lambda *_, **__: ensure_config().get("configurable", {}).get("_credentials", {}).get("refresh_token"),
    # store=InMemoryStore(),
)

def tool_function(date: datetime):
    credentials = get_credentials_from_token_vault()
    # Call Google API using credentials["access_token"]

check_calendar_tool = with_google_calendar_access(
    StructuredTool(
        name="check_user_calendar",
        description="Use this function to check if the user is available on a certain date and time",
        func=tool_function,
        # ...
    )
)
```

2. Add a node to your graph for your tools:

```python
workflow = (
    StateGraph(State)
        .add_node(
            "tools",
            ToolNode(
                [
                    check_calendar_tool,
                    # ...
                ],
                # The error handler should be disabled to allow interruptions to be triggered from within tools.
                handle_tool_errors=False
            )
        )
        # ...
)
```

3. Handle interruptions properly. For example, if the tool does not have access to user's Google Calendar, it will throw an interruption. See [Handling Interrupts](#handling-interrupts) section.

## RAG with FGA

The `FGARetriever` can be used to filter documents based on access control checks defined in Okta FGA. This retriever performs batch checks on retrieved documents, returning only the ones that pass the specified access criteria.

Full Example of [RAG Application](https://github.com/auth0-lab/auth0-ai-python/tree/main/examples/authorization-for-rag/langchain-examples).

Create a retriever instance using the `FGARetriever` class.

```python
from langchain.vectorstores import VectorStoreIndex
from langchain.schema import Document
from auth0_ai_langchain import FGARetriever
from openfga_sdk.client.models import ClientCheckRequest
from openfga_sdk import ClientConfiguration
from openfga_sdk.credentials import CredentialConfiguration, Credentials

# Define some docs:
documents = [
    Document(page_content="This is a public doc", metadata={"doc_id": "public-doc"}),
    Document(page_content="This is a private doc", metadata={"doc_id": "private-doc"}),
]

# Create a vector store:
vector_store = VectorStoreIndex.from_documents(documents)

# Create a retriever:
base_retriever = vector_store.as_retriever()

# Create the FGA retriever wrapper.
# If not provided, FGA settings will be read from env variables: `FGA_STORE_ID`, `FGA_CLIENT_ID`, `FGA_CLIENT_SECRET`, etc.
retriever = FGARetriever(
    base_retriever,
    build_query=lambda node: ClientCheckRequest(
        user=f'user:{user}',
        object=f'doc:{node.metadata["doc_id"]}',
        relation="viewer",
    )
)

# Create a query engine:
query_engine = RetrieverQueryEngine.from_args(
    retriever=retriever,
    llm=OpenAI()
)

# Query:
response = query_engine.query("What is the forecast for ZEKO?")

print(response)
```

## Handling Interrupts

`Auth0AI` uses interrupts extensively and will never block a graph. Whenever an authorizer requires user interaction, the graph throws a `GraphInterrupt` exception with data that allows the client to resume the flow.

It is important to disable error handling in your tools node as follows:

```python
    .add_node(
        "tools",
        ToolNode(
            [
                # your authorizer-wrapped tools
            ],
            # Error handler should be disabled in order to trigger interruptions from within tools.
            handle_tool_errors=False
        )
    )
```

From the client side of the graph you get the interrupts:

```python
from auth0_ai_langchain.utils.interrupt import get_auth0_interrupts

# Get the langgraph thread:
thread = await client.threads.get(thread_id)

# Filter the auth0 interrupts:
auth0_interrupts = get_auth0_interrupts(thread)
```

Then you can resume the thread by doing this:

```python
await client.runs.wait(thread_id, assistant_id)
```

For the specific case of **CIBA (Client-Initiated Backchannel Authorization)** you might attach a `GraphResumer` instance that watches for interrupted threads in the `"Authorization Pending"` state and attempts to resume them automatically, respecting Auth0's polling interval.

```python
import os
from auth0_ai_langchain.async_authorization import GraphResumer
from langgraph_sdk import get_client

resumer = GraphResumer(
    lang_graph=get_client(url=os.getenv("LANGGRAPH_API_URL")),
    # optionally, you can filter by a specific graph:
    filters={"graph_id": "conditional-trade"},
)

resumer \
    .on_resume(lambda thread: print(f"Attempting to resume thread {thread['thread_id']} from interruption {thread['interruption_id']}")) \
    .on_error(lambda err: print(f"Error in GraphResumer: {str(err)}"))

resumer.start()
```

---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png"   width="150">
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_dark_mode.png" width="150">
    <img alt="Auth0 Logo" src="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
  </picture>
</p>
<p align="center">Auth0 is an easy to implement, adaptable authentication and authorization platform. To learn more checkout <a href="https://auth0.com/why-auth0">Why Auth0?</a></p>
<p align="center">
This project is licensed under the Apache 2.0 license. See the <a href="https://github.com/auth0-lab/auth0-ai-python/blob/main/LICENSE"> LICENSE</a> file for more info.</p>
