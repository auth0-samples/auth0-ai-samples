/**
 * LlamaIndex Example: Retrievers with Auth0 FGA (Fine-Grained Authorization)
 *
 *
 */
import "dotenv/config";

import {
  QueryEngineTool,
  ReActAgent,
  Settings,
  VectorStoreIndex,
} from "llamaindex";

import { FGARetriever } from "@auth0/ai-llamaindex";
import { openai, OpenAIEmbedding } from "@llamaindex/openai";
import { SimpleDirectoryReader } from "@llamaindex/readers/directory";

/**
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

Settings.llm = openai({
  model: "gpt-4o-mini",
});

Settings.embedModel = new OpenAIEmbedding({ model: "text-embedding-3-small" });

async function main() {
  console.log(
    "\n..:: LlamaIndex Example: Retrievers with Auth0 FGA (Fine-Grained Authorization)\n\n"
  );

  // UserID
  const user = "user1";
  // 1. Read and load documents from the assets folder
  const documents = await new SimpleDirectoryReader().loadData("./assets/docs");
  // 2. Create an in-memory vector store from the documents using the default OpenAI embeddings
  const vectorStoreIndex = await VectorStoreIndex.fromDocuments(documents);
  // 3. Create a retriever that uses FGA to gate fetching documents on permissions.
  const retriever = FGARetriever.create({
    // Set the similarityTopK to retrieve more documents as SimpleDirectoryReader creates chunks
    retriever: vectorStoreIndex.asRetriever({ similarityTopK: 30 }),
    // FGA tuple to query for the user's permissions
    buildQuery: (document) => ({
      user: `user:${user}`,
      object: `doc:${document.node.metadata.file_name.split(".")[0]}`,
      relation: "viewer",
    }),
  });
  // 4. Create a query engine and convert it into a tool
  const queryEngine = vectorStoreIndex.asQueryEngine({ retriever });
  const tools = [
    new QueryEngineTool({
      queryEngine,
      metadata: {
        name: "zeko-internal-tool",
        description: `This tool can answer detailed questions about ZEKO.`,
      },
    }),
  ];

  // 5. Create an agent using the tools array and OpenAI GPT-4 LLM
  const agent = new ReActAgent({ tools });

  // 6. Query the agent
  let response = await agent.chat({ message: "Show me forecast for ZEKO?" });

  /**
   * Output: `The provided document does not contain any specific forecast information...`
   */
  console.log(response.message.content);

  /**
   * If we add the following tuple to the Auth0 FGA:
   *
   *    { user: "user:user1", relation: "viewer", object: "doc:private-doc" }
   *
   * Then, the output will be: `The forecast for Zeko Advanced Systems Inc. (ZEKO) for fiscal year 2025...`
   */
}

main().catch(console.error);
