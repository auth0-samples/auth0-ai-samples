import * as faiss from "faiss-node";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { openai } from "@ai-sdk/openai";
import { cosineSimilarity, embed, embedMany } from "ai";

const EMBEDDING_MODEL = "text-embedding-3-small";

export type Document = {
  metadata: { id: string };
  text: string;
};

export type DocumentWithScore = {
  document: Document;
  score: number;
};

async function readDoc(path: string) {
  return await fs.readFile(path, "utf-8");
}

/* Reads documents from the assets folder and converts them to langChain Documents */
export async function readDocuments() {
  const folderPath = "./assets/docs";
  const files = await fs.readdir(folderPath);
  const documents: Document[] = [];

  for (const file of files) {
    documents.push({
      text: await readDoc(`${folderPath}/${file}`),
      metadata: { id: file.slice(0, file.lastIndexOf(".")) },
    });
  }

  return documents;
}

export class LocalVectorStore {
  private static db: { embedding: number[]; value: Document }[] = [];

  static async fromDocuments(documents: Document[]) {
    LocalVectorStore.db = [];

    for (const document of documents) {
      const chunks = document.text
        .split(".")
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0 && chunk !== "\n");

      const { embeddings } = await embedMany({
        model: openai.embedding(EMBEDDING_MODEL),
        values: chunks,
      });

      embeddings.forEach((e, i) => {
        LocalVectorStore.db.push({
          embedding: e,
          value: {
            text: chunks[i],
            metadata: { id: document.metadata.id },
          },
        });
      });
    }

    return {
      search: async (query: string, k = 3): Promise<DocumentWithScore[]> => {
        const { embedding } = await embed({
          model: openai.embedding(EMBEDDING_MODEL),
          value: query,
        });

        const context: DocumentWithScore[] = LocalVectorStore.db
          .map((item) => ({
            document: item.value,
            score: cosineSimilarity(embedding, item.embedding),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, k);

        return context;
      },
    };
  }
}
