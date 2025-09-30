from typing import Annotated

from dotenv import load_dotenv
from auth0_ai_langchain import FGARetriever
from langchain_core.prompts import PromptTemplate
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from openfga_sdk.client.models import ClientBatchCheckItem
from typing_extensions import TypedDict

from helpers.memory_store import MemoryStore
from helpers.read_documents import read_documents

# Load the environment variables
load_dotenv()


# Define the conversation graph state
class State(TypedDict):
    """The state of the conversation."""

    # List of messages in the conversation
    messages: Annotated[list, add_messages]


@tool
def agent_retrieve_context_tool(query: str):
    """Call to get information about a company, e.g. What is the financial outlook for ZEKO?"""
    documents = read_documents()
    vector_store = MemoryStore.from_documents(documents)

    user_id = "admin"

    retriever = FGARetriever(
        retriever=vector_store.as_retriever(),
        build_query=lambda doc: ClientBatchCheckItem(
            user=f"user:{user_id}",
            object=f"doc:{doc.metadata.get('id')}",
            relation="viewer",
        ),
    )

    relevant_docs = retriever.invoke(query)

    if len(relevant_docs) > 0:
        return "\n\n".join([doc.page_content for doc in relevant_docs])

    return "I don't have any information on that."


tools = [agent_retrieve_context_tool]


def agent_node(state: State):
    """
    Generate the response from the agent.
    """
    llm_response = llm.invoke(state["messages"])
    return {"messages": [llm_response]}


def generate_response_node(state: State):
    """
    Generate the response from the agent based on the result of the RAG tool.
    """
    prompt = PromptTemplate(
        template="""You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise. Question: {question}. Context: {context}. Answer:""",
        input_variables=["question", "context"],
    )

    question = state["messages"][0].content
    context = state["messages"][-1].content

    chain = prompt | llm

    llm_response = chain.invoke(
        {"question": question, "context": context}, prompt=prompt
    )

    return {"messages": [llm_response]}


def agent_should_continue(state: State):
    """
    Determines whether the conversation should continue based on the user input.
    """
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"

    return END


# Create the OpenAI chat tool
llm = ChatOpenAI(model="gpt-4o-mini").bind_tools(tools)

# Build the graph
graph_builder = StateGraph(State)
tool_node = ToolNode(tools)

# Define the nodes
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", tool_node)
graph_builder.add_node("generate_response", generate_response_node)

# Define the edges
graph_builder.add_edge(START, "agent")
graph_builder.add_conditional_edges(
    "agent",
    agent_should_continue,
    ["tools", END],
)
graph_builder.add_edge("tools", "generate_response")

# Compile the graph
graph = graph_builder.compile()

# Run the graph
result = graph.invoke(
    {"messages": [("human", "What is the financial outlook for ZEKO?")]}
)
print(result["messages"][-1].content)
