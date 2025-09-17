import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { FGARetriever } from '@auth0/ai-langchain/RAG';

import { getVectorStore } from '@/lib/rag/embedding';

export const getContextDocumentsTool = tool(
  async ({ question }, config) => {
    const user = config.configurable?.langgraph_auth_user;

    if (!user) {
      return 'There is no user logged in.';
    }

    const vectorStore = await getVectorStore();

    if (!vectorStore) {
      return 'There is no vector store.';
    }

    const retriever = FGARetriever.create({
      retriever: vectorStore.asRetriever(),
      buildQuery: (doc) => ({
        user: `user:${user?.sub}`,
        object: `doc:${doc.metadata.documentId}`,
        relation: 'owner',
      }),
    });

    // filter docs based on FGA authorization
    const documents = await retriever.invoke(question);
    return documents.map((doc) => doc.pageContent).join('\n\n');
  },
  {
    name: 'get_context_documents',
    description:
      'Use the tool when user asks for documents or projects or anything that is stored in the knowledge base.',
    schema: z.object({
      question: z.string().describe('the users question'),
    }),
  },
);
