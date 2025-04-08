import "dotenv/config";

import { FGAFilter } from "@auth0/ai";
import {
  DocumentWithScore,
  generate,
  LocalVectorStore,
  readDocuments,
} from "./helpers";

async function main() {
  // User ID
  const user = "user1";
  // User query
  const query = "Show me forecast for ZEKO?";

  // 1. RAG pipeline
  const documents = readDocuments();
  // `LocalVectorStore` is a helper function that creates a Faiss index
  // and uses OpenAI embeddings API to encode the documents.
  const vectorStore = await LocalVectorStore.fromDocuments(documents);

  // 2. Create an instance of the FGARetriever
  const retriever = FGAFilter.create({
    buildQuery: (doc: DocumentWithScore) => ({
      user: `user:${user}`,
      object: `doc:${doc.document.id}`,
      relation: "viewer",
    }),
  });

  const results = await vectorStore.search(query);

  // 3. Filter documents based on user permissions
  const context = await retriever.filter(results);

  // 4. Generate a response based on the context
  // `generate` is a helper function that takes a query and a context and returns
  // a response using OpenAI chat completion API.
  const answer = await generate(query, context);

  // 5. Print the answer
  console.log(answer);
}

main().catch(console.error);
