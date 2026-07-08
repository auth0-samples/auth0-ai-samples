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

export const CLOUDFLARE_MCP_SERVER: McpServerConfig = {
  connection: 'cloudflare',
  url: 'https://mcp.cloudflare.com/mcp',
  scopes: [],
};

export const SENTRY_MCP_SERVER: McpServerConfig = {
  connection: 'sentry',
  url: 'https://mcp.sentry.dev/mcp',
  scopes: ['org:read', 'project:write', 'team:write', 'event:write'],
};

export const ASANA_MCP_SERVER: McpServerConfig = {
  connection: 'asana',
  url: 'https://mcp.asana.com/v2/mcp',
  scopes: ['default'],
};

export const SLACK_MCP_SERVER: McpServerConfig = {
  connection: 'slack',
  url: 'https://mcp.slack.com/mcp',
  scopes: [],
};

export const SALESFORCE_MCP_SERVER: McpServerConfig = {
  connection: 'salesforce',
  url: 'https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads',
  scopes: ['mcp_api', 'refresh_token'],
};

export const SNOWFLAKE_MCP_SERVER: McpServerConfig = {
  connection: 'snowflake',
  // Account-specific URL - must be set via SNOWFLAKE_MCP_URL.
  url: '',
  scopes: [],
};

export const HUBSPOT_MCP_SERVER: McpServerConfig = {
  connection: 'hubspot',
  url: 'https://mcp.hubspot.com',
  scopes: [],
};

export const GMAIL_MCP_SERVER: McpServerConfig = {
  connection: 'google-workspace',
  url: 'https://gmailmcp.googleapis.com/mcp/v1',
  scopes: [],
};

export const GCALENDAR_MCP_SERVER: McpServerConfig = {
  connection: 'google-workspace',
  url: 'https://calendarmcp.googleapis.com/mcp/v1',
  scopes: [],
};

export const GDRIVE_MCP_SERVER: McpServerConfig = {
  connection: 'google-workspace',
  url: 'https://drivemcp.googleapis.com/mcp/v1',
  scopes: [],
};

const ALL_MCP_SERVERS: Record<string, McpServerConfig> = {
  notion: NOTION_MCP_SERVER,
  github: GITHUB_MCP_SERVER,
  linear: LINEAR_MCP_SERVER,
  atlassian: ATLASSIAN_MCP_SERVER,
  cloudflare: CLOUDFLARE_MCP_SERVER,
  sentry: SENTRY_MCP_SERVER,
  asana: ASANA_MCP_SERVER,
  slack: SLACK_MCP_SERVER,
  salesforce: SALESFORCE_MCP_SERVER,
  snowflake: SNOWFLAKE_MCP_SERVER,
  hubspot: HUBSPOT_MCP_SERVER,
  gmail: GMAIL_MCP_SERVER,
  gcalendar: GCALENDAR_MCP_SERVER,
  gdrive: GDRIVE_MCP_SERVER,
};

const URL_OVERRIDES: Record<string, string> = {
  notion: 'NOTION_MCP_URL',
  github: 'GITHUB_MCP_URL',
  linear: 'LINEAR_MCP_URL',
  atlassian: 'ATLASSIAN_MCP_URL',
  cloudflare: 'CLOUDFLARE_MCP_URL',
  sentry: 'SENTRY_MCP_URL',
  asana: 'ASANA_MCP_URL',
  slack: 'SLACK_MCP_URL',
  salesforce: 'SALESFORCE_MCP_URL',
  snowflake: 'SNOWFLAKE_MCP_URL',
  hubspot: 'HUBSPOT_MCP_URL',
  gmail: 'GMAIL_MCP_URL',
  gcalendar: 'GCALENDAR_MCP_URL',
  gdrive: 'GDRIVE_MCP_URL',
};

type Env = Record<string, string | undefined>;

/**
 * Returns the MCP servers to connect to, driven by the ENABLED_MCP_SERVERS
 * environment variable (comma-separated connection names, e.g. "notion,github").
 * Defaults to Notion only when the variable is not set.
 */
export function loadMcpServers(env: Env): McpServerConfig[] {
  const enabled = env.ENABLED_MCP_SERVERS
    ? env.ENABLED_MCP_SERVERS.split(',').map((s) => s.trim())
    : ['notion'];

  return enabled
    .filter((name) => ALL_MCP_SERVERS[name])
    .map((name) => ({
      ...ALL_MCP_SERVERS[name],
      url: env[URL_OVERRIDES[name]] ?? ALL_MCP_SERVERS[name].url,
    }));
}
