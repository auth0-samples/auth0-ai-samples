package rag;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import dev.langchain4j.data.document.loader.FileSystemDocumentLoader;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import static dev.langchain4j.model.openai.OpenAiChatModelName.GPT_4_O_MINI;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.store.embedding.EmbeddingStoreIngestor;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import dev.openfga.sdk.api.client.model.ClientBatchCheckItem;
import io.github.cdimascio.dotenv.Dotenv;

/**
 * Demonstrates the usage of the Auth0 FGA (Fine-Grained Authorization)
 * with a vector store index to query documents with permission checks.
 * <p>
 * The FGARetriever checks if the user has the "viewer" relation to the document
 * based on predefined tuples in Auth0 FGA.
 * <p>
 * Example:
 * - A tuple {user: "user:*", relation: "viewer", object: "doc:public-doc"}
 * allows all users to view "public-doc".
 * - A tuple {user: "user:user1", relation: "viewer", object: "doc:private-doc"}
 * allows "user1" to view "private-doc".
 * <p>
 * The output of the query depends on the user's permissions to view the
 * documents.
 */
public class RagApplication {
    static Logger log = LoggerFactory.getLogger("RAG");

    static {
        Dotenv.configure().systemProperties().load();
    }

    public static void main(String[] args) throws Exception {
        final ChatLanguageModel CHAT_MODEL_OPENAI = OpenAiChatModel.builder()
                .apiKey(System.getProperty("OPENAI_API_KEY"))
                .modelName(GPT_4_O_MINI)
                .build();

        // final ChatLanguageModel CHAT_MODEL_OLLAMA = OllamaChatModel.builder()
        // .baseUrl("http://localhost:11434")
        // .modelName("deepseek-r1:1.5b")
        // .build();

        var user = "user2";
        // 1. Read and load documents from the assets folder
        var documents = FileSystemDocumentLoader.loadDocuments("src/main/resources/docs");
        // 2. Create an in-memory vector store from the documents.
        InMemoryEmbeddingStore<TextSegment> embeddingStore = new InMemoryEmbeddingStore<>();
        EmbeddingStoreIngestor.ingest(documents, embeddingStore);
        // 3. Create a base retriever
        ContentRetriever baseRetriever = EmbeddingStoreContentRetriever.from(embeddingStore);
        // 4. Create the FGA retriever that wraps the base retriever
        ContentRetriever fgaRetriever = FGARetriever.create(
                baseRetriever,
                // FGA tuple to query for the user's permissions
                content -> new ClientBatchCheckItem()
                        .user("user:" + user)
                        .relation("viewer")
                        ._object("doc:" + content.textSegment().metadata().getString("file_name").split("\\.")[0])

        );

        // 5. Create an assistant with the FGA retriever
        var assistant = AiServices.builder(Assistant.class)
                .chatLanguageModel(CHAT_MODEL_OPENAI)
                .chatMemory(MessageWindowChatMemory.withMaxMessages(10))
                .contentRetriever(fgaRetriever)
                .build();

        // 6. Query the retrieval chain with a prompt
        var query = "Show me forecast for ZEKO?";
        System.out.println("==================================================");
        System.out.println("User: " + query);

        var answer = assistant.chat(query);
        System.out.println("==================================================");
        System.out.println("Assistant: " + answer);
        System.out.println("==================================================");
    }
}

interface Assistant {
    String chat(String userMessage);
}