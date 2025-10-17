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
        name: "zeko_document_search",
        description: `Use this tool to search and retrieve information about ZEKO company, including forecasts, financial data, company information, products, and services. This tool searches through authorized ZEKO documents and returns relevant information.`,
      },
    }),
  ];

  // 5. Create an agent using the tools array and OpenAI GPT-4 LLM
  const agent = new ReActAgent({ 
    tools,
    systemPrompt: `You are a helpful assistant that has access to tools to answer questions about ZEKO company. When a user asks about ZEKO, always use the available tools to search for information. You have access to a document search tool that can find information about ZEKO.`
  });

  // 6. Query the agent
  let response = await agent.chat({ message: "Show me forecast for ZEKO?" });

  /**
   * Output: `The forecast for ZEKO Advanced Systems Inc. (ZAS) appears positive due to several key factors...`
   * This is based on the publicly available information from public-doc.md since user1 only has
   * access to public documents. The detailed bearish forecast in private-doc.md is not accessible.
   */
  console.log(response.message.content);

  console.log("\n💡 Expected behavior:");
  console.log("   - Current user 'user1' only has access to 'public-doc'");
  console.log("   - Agent generates positive forecast based on public company information");
  console.log("   - The detailed bearish forecast in 'private-doc' is protected by FGA");
  console.log("   - To access private-doc, add this tuple to FGA:");
  console.log('     { user: "user:user1", relation: "viewer", object: "doc:private-doc" }');

  /**
   * If we add the following tuple to the Auth0 FGA:
   *
   *    { user: "user:user1", relation: "viewer", object: "doc:private-doc" }
   *
   * Then, the output will include the detailed bearish forecast from private-doc.md:
   * "The forecast for Zeko Advanced Systems Inc. (ZEKO) for fiscal year 2025..."
   */
}

main().catch(console.error);
