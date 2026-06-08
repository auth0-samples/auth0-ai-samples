import { describe, expect, it } from 'vitest';

import { loadMcpServers, NOTION_MCP_SERVER } from './servers';

describe('loadMcpServers', () => {
  it('returns the Notion server by default', () => {
    const servers = loadMcpServers({});
    expect(servers).toHaveLength(1);
    expect(servers[0]).toEqual(NOTION_MCP_SERVER);
  });

  it('pairs each server with an Auth0 connection used for the Token Vault exchange', () => {
    const [notion] = loadMcpServers({});
    expect(notion.connection).toBe('notion');
    expect(notion.url).toBe('https://mcp.notion.com/mcp');
  });

  it('lets the Notion server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({ NOTION_MCP_URL: 'https://mcp.notion.test/mcp' });
    expect(servers[0].url).toBe('https://mcp.notion.test/mcp');
    expect(servers[0].connection).toBe('notion');
  });
});
