import { embed, embedMany } from 'ai';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { chunk } from 'llm-chunk';

import { db } from '@/lib/db';
import { embeddings } from '@/lib/db/schema/embeddings';
import { openai } from '@ai-sdk/openai';

const embeddingModel = openai.embedding('text-embedding-3-small');

export const generateEmbeddings = async (value: string): Promise<Array<{ embedding: number[]; content: string }>> => {
  const chunks = chunk(value);

  // Filter out empty or whitespace-only chunks
  const validChunks = chunks.filter((chunk) => chunk && chunk.trim().length > 0);

  if (validChunks.length === 0) {
    throw new Error('No valid chunks found after filtering empty content');
  }

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: validChunks,
  });
  return embeddings.map((e, i) => ({ content: validChunks[i], embedding: e }));
};

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll('\\n', ' ');
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
};

export const findRelevantContent = async (userQuery: string, limit = 4) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);
  const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding, userQueryEmbedded)})`;
  const similarGuides = await db
    .select({ content: embeddings.content, similarity, documentId: embeddings.documentId })
    .from(embeddings)
    .where(gt(similarity, 0.5))
    .orderBy((t: any) => desc(t.similarity))
    .limit(limit);
  return similarGuides;
};
