/**
 * Static catalog of the remote MCP servers this demo connects to.
 *
 * Each entry pairs an MCP server URL with the Auth0 Connection whose Token Vault
 * tokens authorize calls to it. Auth0 never learns the MCP server URL — it only
 * mints a federated access token for the Connection — so the URL lives here in
 * app config rather than in the tenant.
 */
export type McpServerConfig = {
  /** Human-readable id, also used as the Auth0 Connection name. */
  connection: string;
  /** Streamable HTTP endpoint of the remote MCP server. */
  url: string;
  /** Scopes requested when minting the Token Vault access token. */
  scopes: string[];
};

export const NOTION_MCP_SERVER: McpServerConfig = {
  connection: 'notion',
  url: 'https://mcp.notion.com/mcp',
  scopes: [],
};

type Env = Record<string, string | undefined>;

export function loadMcpServers(env: Env): McpServerConfig[] {
  return [
    {
      ...NOTION_MCP_SERVER,
      url: env.NOTION_MCP_URL ?? NOTION_MCP_SERVER.url,
    },
  ];
}
