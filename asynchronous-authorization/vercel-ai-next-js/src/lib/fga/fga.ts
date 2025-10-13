import { buildOpenFgaClient } from '@auth0/ai';

// Initialize FGA client only if credentials are provided
let fgaClient: ReturnType<typeof buildOpenFgaClient> | null = null;

try {
  // Check if FGA credentials are available
  if (process.env.FGA_CLIENT_ID && process.env.FGA_STORE_ID) {
    fgaClient = buildOpenFgaClient();
  }
} catch (error) {
  console.warn('FGA client initialization failed. FGA features will be disabled.', error);
}

export { fgaClient };

export const addRelation = async (userEmail: string, documentId: string, relation = 'owner') => {
  if (!fgaClient) {
    console.warn('FGA client not available. Skipping relation addition.');
    return;
  }
  
  return fgaClient.write({
    writes: [{ user: `user:${userEmail}`, relation, object: `doc:${documentId}` }],
  });
};

export const deleteRelation = async (userEmail: string, documentId: string, relation = 'owner') => {
  if (!fgaClient) {
    console.warn('FGA client not available. Skipping relation deletion.');
    return;
  }

  return fgaClient.write({
    deletes: [{ user: `user:${userEmail}`, relation, object: `doc:${documentId}` }],
  });
};
