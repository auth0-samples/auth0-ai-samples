import "dotenv/config";

import { generateText, tool } from "ai";
import { FGAFilter } from "@auth0/ai";
import {
  DocumentWithScore,
  LocalVectorStore,
  readDocuments,
} from "./helpers/helpers";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

async function main() {
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

  // 4. Generate a response using Vercel AI SDK
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    prompt,
    system: `You are a helpful assistant. Use the tool to get information regarding ZEKO and answer the user's question based on that information.`,
    tools: {
      getInformation: tool({
        description: `get information from your knowledge base to answer questions.`,
        parameters: z.object({
          question: z.string().describe("the users question"),
        }),
        execute: async ({ question }) => {
          // Search for relevant documents
          const results = await vectorStore.search(question, 20);

          // Filter documents based on user permissions
          const context = await retriever.filter(results);

          //   return context.map((c) => c.document.text).join("\n\n");
          return context;
        },
      }),
    },
  });

  // 5. Print the answer
  console.log(result.text);
}

main().catch(console.error);
