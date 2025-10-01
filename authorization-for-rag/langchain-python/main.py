from dotenv import load_dotenv
from langchain.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI
from auth0_ai_langchain import FGARetriever
from openfga_sdk.client.models import ClientBatchCheckItem
from helpers.memory_store import MemoryStore
from helpers.read_documents import read_documents

load_dotenv()


class RAG:
    def __init__(self):
        documents = read_documents()
        self.vector_store = MemoryStore.from_documents(documents)
        self.prompt = ChatPromptTemplate.from_template(
            """You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.\\nQuestion: {question}\\nContext: {context}\\nAnswer:"""
        )

        self.llm = ChatOpenAI(model="gpt-4o-mini")

    def query(self, user_id: str, question: str):
        chain = (
            {
                "context": FGARetriever(
                    retriever=self.vector_store.as_retriever(),
                    build_query=lambda doc: ClientBatchCheckItem(
                        user=f"user:{user_id}",
                        object=f"doc:{doc.metadata.get('id')}",
                        relation="viewer",
                    ),
                ),
                "question": RunnablePassthrough(),
            }
            | self.prompt
            | self.llm
            | StrOutputParser()
        )

        return chain.invoke(question)


if __name__ == "__main__":
    rag = RAG()

    question = "What is the forecast for ZEKO?"

    # Juan only has access to public docs
    response = rag.query("juan", question)
    print("Response to Juan:", response)

    # Admin has access to all docs
    response = rag.query("admin", question)
    print("Response to Admin:", response)
