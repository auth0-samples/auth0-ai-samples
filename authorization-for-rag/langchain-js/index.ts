/**
 * LangChain Example: Retrievers with Auth0 FGA (Fine-Grained Authorization)
 */
import "dotenv/config";

import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FGARetriever } from "@auth0/ai-langchain/RAG";
import { RetrievalChain } from "./helpers/langchain";
import { readDocuments } from "./helpers/read-documents";

/**
 * Demonstrates the usage of the Auth0 FGA (Fine-Grained Authorization)
 * with a vector store index to query documents with permission checks.
 *
 * The FGARetriever checks if the user has the "viewer" relation to the document
 * based on predefined tuples in Auth0 FGA.
 *
 * Example:
 * - A tuple {user: "user:*", relation: "viewer", object: "doc:public-doc"} allows all users to view "public-doc".
 * - A tuple {user: "user:user1", relation: "viewer", object: "doc:private-doc"} allows "user1" to view "private-doc".
 *
 * The output of the query depends on the user's permissions to view the documents.
 */
async function main() {
  console.info(
    "\n..:: Langchain Example: Retrievers with Auth0 FGA (Fine-Grained Authorization)\n\n"
  );

  // UserID
  const user = "user1";
  // 1. Read and load documents from the assets folder
  const documents = await readDocuments();
  // 2. Create an in-memory vector store from the documents for OpenAI models.
  const vectorStore = await MemoryVectorStore.fromDocuments(
    documents,
    new OpenAIEmbeddings({ model: "text-embedding-3-small" })
  );
  // 3. Create a retrieval chain with root prompt and OpenAI model configuration
  const retrievalChain = await RetrievalChain.create({
    // 4. Chain the retriever with the FGARetriever to check the permissions.
    retriever: FGARetriever.create({
      retriever: vectorStore.asRetriever(),
      // FGA tuple to query for the user's permissions
      buildQuery: (doc) => ({
        user: `user:${user}`,
        object: `doc:${doc.metadata.id}`,
        relation: "viewer",
      }),
    }),
  });
  // 5. Query the retrieval chain with a prompt
  const answer = await retrievalChain.query("Show me forecast for ZEKO?");

  /**
   * Output: `The provided context does not include specific financial forecasts...`
   */
  console.info(answer);

  /**
   * If we add the following tuple to the Auth0 FGA:
   *
   *    { user: "user:user1", relation: "viewer", object: "doc:private-doc" }
   *
   * Then, the output will be: `The forecast for Zeko Advanced Systems Inc. (ZEKO) for fiscal year 2025...`
   */
}

main().catch(console.error);
