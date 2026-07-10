import { createMCPClient } from '@ai-sdk/mcp';
import { TokenVaultError } from '@auth0/ai/interrupts';

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;
export type McpToolSet = Awaited<ReturnType<McpClient['tools']>>;

export type ConnectMcpServerParams = {
  /** Streamable HTTP endpoint of the remote MCP server. */
  url: string;
  /** Auth0 Connection that minted the access token (for diagnostics). */
  connection: string;
  /** Token Vault access token to present to the MCP server. */
  accessToken: string;
};

export type ConnectedMcpServer = {
  tools: McpToolSet;
  close: () => Promise<void>;
};

function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const status = (error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status;
  return status === 401 || status === 403;
}

/**
 * Connects to a remote MCP server over Streamable HTTP, authenticating with the
 * Token Vault access token, and returns the discovered tools.
 *
 * A 401/403 from the server means the user's connected-account token is missing
 * or expired, so we surface a TokenVaultError to drive the connect-account flow.
 */
export async function connectMcpServer({ url, connection, accessToken }: ConnectMcpServerParams): Promise<ConnectedMcpServer> {
  let client: McpClient | undefined;
  try {
    client = await createMCPClient({
      transport: {
        type: 'http',
        url,
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });

    // Some MCP servers authenticate lazily, only validating the token on the
    // first real request, so tool discovery must share the same 401/403 guard.
    const tools = await client.tools();
    return { tools, close: () => client!.close() };
  } catch (error) {
    await client?.close();
    if (isUnauthorized(error)) {
      throw new TokenVaultError(`Authorization required to access the "${connection}" MCP server`);
    }
    throw error;
  }
}
