/**
 * LlamaIndex Example: Retrievers with Okta FGA (Fine-Grained Authorization)
 *
 *
 */
import "dotenv/config";

import { VectorStoreIndex } from "llamaindex";
import { FGARetriever } from "@auth0/ai-llamaindex";

import { readDocuments } from "./helpers/read-documents";

/**
 * Demonstrates the usage of the Okta FGA (Fine-Grained Authorization)
 * with a vector store index to query documents with permission checks.
 *
 * The FGARetriever checks if the user has the "viewer" relation to the document
 * based on predefined tuples in Okta FGA.
 *
 * Example:
 * - A tuple {user: "user:*", relation: "viewer", object: "doc:public-doc"} allows all users to view "public-doc".
 * - A tuple {user: "user:user1", relation: "viewer", object: "doc:private-doc"} allows "user1" to view "private-doc".
 *
 * The output of the query depends on the user's permissions to view the documents.
 */
async function main() {
  console.log(
    "\n..:: LlamaIndex Example: Retrievers with Okta FGA (Fine-Grained Authorization)\n\n"
  );

  // UserID
  const user = "user1";
  // 1. Read and load documents from the assets folder
  const documents = await readDocuments();
  // 2. Create an in-memory vector store from the documents using the default OpenAI embeddings
  const vectorStoreIndex = await VectorStoreIndex.fromDocuments(documents);
  // 3. Create query engine using the default OpenAI's GPT-4 LLM
  const queryEngine = vectorStoreIndex.asQueryEngine({
    // 4. Decorate the retriever with the FGARetriever to check the permissions.
    retriever: FGARetriever.create({
      retriever: vectorStoreIndex.asRetriever(),
      // FGA tuple to query for the user's permissions
      buildQuery: (document) => ({
        user: `user:${user}`,
        object: `doc:${document.node.metadata.id}`,
        relation: "viewer",
      }),
    }),
  });

  // 5. Query the engine
  const vsiResponse = await queryEngine.query({
    query: "Show me forecast for ZEKO?",
  });

  /**
   * Output: `The provided document does not contain any specific forecast information...`
   */
  console.log(vsiResponse.toString());

  /**
   * If we add the following tuple to the Okta FGA:
   *
   *    { user: "user:user1", relation: "viewer", object: "doc:private-doc" }
   *
   * Then, the output will be: `The forecast for Zeko Advanced Systems Inc. (ZEKO) for fiscal year 2025...`
   */
}

main().catch(console.error);
