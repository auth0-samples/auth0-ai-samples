## Authorization for RAG with Auth0 FGA

Authorization for RAG ensure that users can only access documents they are permitted to view. By enforcing strict access controls during the document retrieval process, it prevents unauthorized data exposure and maintains data security. For more information, refer to the [documentation](https://demo.auth0.ai/docs/authorization-for-rag).

### How It Works

1. **User Query**: A user submits a query requiring information retrieval.
2. **Document Retrieval**: The system employs a retriever to search its vector store for documents relevant to the query.
3. **Authorization Check**: Auth0 FGA verifies the user's permissions, filtering out any documents the user is not authorized to access.
4. **Response Generation**: Based on the authorized documents, the system generates a response tailored to the user's access level.

### Diagram

Below is a high-level workflow:

<p align="center">
    <img style="margin-left: auto; margin-right: auto;" height="700px" src="https://images.ctfassets.net/23aumh6u8s0i/76DegvQtjEx5jNDcqvy1VD/462977639c07dd1d92e82783d66aac7e/rag-with-fga-flow.png" />
<p>

### Examples

Explore the following examples demonstrating the integration of **Auth0 FGA** with **LangChain** and **LlamaIndex** retrievers:

- **LangChain with FGARetriever (JavaScript):**  
   An implementation showcasing how to wrap a LangChain retriever with FGARetriever to enforce authorization checks during document retrieval.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/lanchain-js)

- **LangChain with FGARetriever (Python):**  
   A Python implementation demonstrating authorization-aware document retrieval using LangChain and FGARetriever.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/langchain-python)

- **LangGraph with FGARetriever (Python):**  
   Shows how to integrate FGARetriever with LangGraph for authorized document retrieval in Python applications.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/langgraph-python)

- **LangChain4j with FGARetriever (Java):**  
   A Java implementation demonstrating authorization-aware document retrieval using LangChain4j and FGARetriever.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/langchain4j-java)

- **LangGraph Agentic with FGARetriever (JavaScript):**  
   Shows how to integrate FGARetriever with LangGraph's agentic framework for authorized document retrieval in JavaScript.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/langgraph-agentic-js)

- **LangGraph StateGraph with FGARetriever (JavaScript):**  
   Demonstrates using FGARetriever with LangGraph's state graph approach for authorized retrieval in JavaScript.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/langgraph-stategraph-js)

- **LlamaIndex with FGARetriever (JavaScript):**  
   An implementation showing how to use FGARetriever with LlamaIndex for authorized document retrieval in JavaScript.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/llamaindex-js)

- **LlamaIndex Agentic with FGARetriever (JavaScript):**  
   Shows how to combine FGARetriever with LlamaIndex's agentic capabilities for authorized retrieval in JavaScript.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/llamaindex-agentic-js)

- **OpenAI with FGARetriever (JavaScript):**  
   A direct implementation using OpenAI's APIs with FGARetriever for authorized document retrieval in JavaScript.  
   [View Example](https://github.com/oktadev/auth0-ai-samples/tree/main/authorization-for-rag/openai-fga-js)
