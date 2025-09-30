from collections import deque
from typing import List, TypedDict

from dotenv import load_dotenv
from langchain.schema import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from openfga_sdk.client.models import ClientBatchCheckItem
from auth0_ai_langchain import FGARetriever

from helpers.memory_store import MemoryStore
from helpers.read_documents import read_documents

load_dotenv()

documents = read_documents()
vector_store = MemoryStore.from_documents(documents)
llm = ChatOpenAI(model="gpt-4o-mini")


class GraphState(TypedDict):
    """
    Graph state for the RAG model.
    """

    question: str
    user_id: str
    documents: List[Document]
    response: str


def retrieve(state: GraphState):
    """
    Retrieve relevant documents for the given question and user.
    """
    retriever = FGARetriever(
        retriever=vector_store.as_retriever(),
        build_query=lambda doc: ClientBatchCheckItem(
            user=f"user:{state['user_id']}",
            object=f"doc:{doc.metadata.get('id')}",
            relation="viewer",
        ),
    )

    return {
        "documents": retriever.invoke(state["question"]),
    }


def prompt_llm(state: GraphState):
    """
    Prompt the LLM with the question and context.
    """
    answer = llm.invoke(
        [
            SystemMessage(
                content=f"You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise. {state['documents']}"
            ),
            HumanMessage(content=f"Here is the question: {state['question']}"),
        ]
    )
    return {
        "response": answer.content,
    }


workflow = StateGraph(GraphState)
workflow.add_node("retrieve", retrieve)
workflow.add_node("prompt_llm", prompt_llm)

workflow.set_entry_point("retrieve")
workflow.add_edge("retrieve", "prompt_llm")


graph = workflow.compile()

if __name__ == "__main__":
    stream = graph.stream(
        {"question": "What is the forecast for ZEKO?", "user_id": "juan"}
    )
    last_state = deque(stream, maxlen=1).pop()
    print("Response to Juan:", last_state["prompt_llm"]["response"])

    stream = graph.stream(
        {"question": "What is the forecast for ZEKO?", "user_id": "admin"}
    )
    last_state = deque(stream, maxlen=1).pop()
    print("Response to Admin:", last_state["prompt_llm"]["response"])
