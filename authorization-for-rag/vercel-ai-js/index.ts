import "dotenv/config";

import { generateText } from "ai";
import { FGAFilter } from "@auth0/ai";
import {
  DocumentWithScore,
  LocalVectorStore,
  readDocuments,
} from "./helpers/helpers";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

async function main() {
  console.log(
    "\n..:: Vercel AI SDK Example: Retrievers with Auth0 FGA (Fine-Grained Authorization)\n\n"
  );
  // User ID
  const user = "user1";
  // User query
  const prompt = "Show me forecast for ZEKO?";

  // 1. RAG pipeline
  const documents = await readDocuments();
  // `LocalVectorStore` is a helper function that creates a Faiss index
  // and uses OpenAI embeddings API to encode the documents.
  const vectorStore = await LocalVectorStore.fromDocuments(documents);

  // 2. Create an instance of the FGARetriever
  const retriever = FGAFilter.create({
    buildQuery: (doc: DocumentWithScore) => ({
      user: `user:${user}`,
      object: `doc:${doc.document.metadata.id}`,
      relation: "viewer",
    }),
  });

  // 3. Search for relevant documents
  const results = await vectorStore.search(prompt, 20);

  // 4. Filter documents based on user permissions
  const context = await retriever.filter(results);

  // 5. Generate a response using Vercel AI SDK
  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    prompt: `Answer the following question based only on the provided context:
             ${context.map((c) => c.document.text).join("\n\n")}

             Question: ${prompt}`,
  });

  // 6. Print the answer
  console.log(text);

  /**
   * Can also be used as a tool to provide context to the Agent  
  const getFinancialInfo = tool({
    description: `get information from your knowledge base to answer questions.`,
    parameters: z.object({
      question: z.string().describe("the users question"),
    }),
    execute: async ({ question }) => {
      // Search for relevant documents
      const results = await vectorStore.search(question, 20);

      // Filter documents based on user permissions
      const context = await retriever.filter(results);

      return context.map((c) => c.document.text).join("\n\n");
    },
  }); 
  */
}

main().catch(console.error);
