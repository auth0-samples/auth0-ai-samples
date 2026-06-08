import type { Auth0Client } from '@auth0/nextjs-auth0/server';

import { connectMcpServer, type McpToolSet } from './client';
import { getConnectionAccessToken } from './connection-token';
import { loadMcpServers } from './servers';

export type CollectedMcpTools = {
  tools: McpToolSet;
  close: () => Promise<void>;
};

/**
 * Opens every configured remote MCP server using a Token Vault access token for
 * its Connection, and returns the union of their tools.
 *
 * If the user has not connected an account, getConnectionAccessToken throws a
 * TokenVaultInterrupt before we attempt to open the server; that propagates up
 * to the chat route, which serializes it for the connect-account UI.
 */
export async function collectMcpTools(auth0: Auth0Client): Promise<CollectedMcpTools> {
  const servers = loadMcpServers(process.env);
  const closers: Array<() => Promise<void>> = [];
  let tools: McpToolSet = {};

  for (const server of servers) {
    const accessToken = await getConnectionAccessToken(auth0, {
      connection: server.connection,
      scopes: server.scopes,
    });

    const connected = await connectMcpServer({
      url: server.url,
      connection: server.connection,
      accessToken,
    });

    closers.push(connected.close);
    tools = { ...tools, ...connected.tools };
  }

  return {
    tools,
    close: async () => {
      await Promise.all(closers.map((close) => close()));
    },
  };
}
