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

export const GITHUB_MCP_SERVER: McpServerConfig = {
  connection: 'github',
  url: 'https://api.githubcopilot.com/mcp',
  scopes: [],
};

export const LINEAR_MCP_SERVER: McpServerConfig = {
  connection: 'linear',
  url: 'https://mcp.linear.app/mcp',
  scopes: ['read'],
};

export const ATLASSIAN_MCP_SERVER: McpServerConfig = {
  connection: 'atlassian',
  url: 'https://mcp.atlassian.com/v1/mcp/authv2',
  scopes: [],
};

type Env = Record<string, string | undefined>;

export function loadMcpServers(env: Env): McpServerConfig[] {
  return [
    {
      ...NOTION_MCP_SERVER,
      url: env.NOTION_MCP_URL ?? NOTION_MCP_SERVER.url,
    },
    {
      ...GITHUB_MCP_SERVER,
      url: env.GITHUB_MCP_URL ?? GITHUB_MCP_SERVER.url,
    },
    {
      ...LINEAR_MCP_SERVER,
      url: env.LINEAR_MCP_URL ?? LINEAR_MCP_SERVER.url,
    },
    {
      ...ATLASSIAN_MCP_SERVER,
      url: env.ATLASSIAN_MCP_URL ?? ATLASSIAN_MCP_SERVER.url,
    },
  ];
}
