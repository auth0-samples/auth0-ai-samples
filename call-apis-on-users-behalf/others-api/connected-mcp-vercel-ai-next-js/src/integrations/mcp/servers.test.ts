import { describe, expect, it } from 'vitest';

import { loadMcpServers, NOTION_MCP_SERVER, GITHUB_MCP_SERVER, LINEAR_MCP_SERVER, ATLASSIAN_MCP_SERVER, CLOUDFLARE_MCP_SERVER } from './servers';

describe('loadMcpServers', () => {
  it('returns all configured servers by default', () => {
    const servers = loadMcpServers({});
    expect(servers).toHaveLength(5);
    expect(servers[0]).toEqual(NOTION_MCP_SERVER);
    expect(servers[1]).toEqual(GITHUB_MCP_SERVER);
    expect(servers[2]).toEqual(LINEAR_MCP_SERVER);
    expect(servers[3]).toEqual(ATLASSIAN_MCP_SERVER);
    expect(servers[4]).toEqual(CLOUDFLARE_MCP_SERVER);
  });

  it('pairs each server with an Auth0 connection used for the Token Vault exchange', () => {
    const [notion, github, linear, atlassian, cloudflare] = loadMcpServers({});
    expect(notion.connection).toBe('notion');
    expect(notion.url).toBe('https://mcp.notion.com/mcp');
    expect(github.connection).toBe('github');
    expect(github.url).toBe('https://api.githubcopilot.com/mcp');
    expect(linear.connection).toBe('linear');
    expect(linear.url).toBe('https://mcp.linear.app/mcp');
    expect(atlassian.connection).toBe('atlassian');
    expect(atlassian.url).toBe('https://mcp.atlassian.com/v1/mcp/authv2');
    expect(cloudflare.connection).toBe('cloudflare');
    expect(cloudflare.url).toBe('https://mcp.cloudflare.com/mcp');
  });

  it('lets the Notion server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({ NOTION_MCP_URL: 'https://mcp.notion.test/mcp' });
    expect(servers[0].url).toBe('https://mcp.notion.test/mcp');
    expect(servers[0].connection).toBe('notion');
  });

  it('lets the GitHub server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({ GITHUB_MCP_URL: 'https://api.githubcopilot.test/mcp' });
    expect(servers[1].url).toBe('https://api.githubcopilot.test/mcp');
    expect(servers[1].connection).toBe('github');
  });

  it('lets the Linear server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({ LINEAR_MCP_URL: 'https://mcp.linear.test/mcp' });
    expect(servers[2].url).toBe('https://mcp.linear.test/mcp');
    expect(servers[2].connection).toBe('linear');
  });

  it('lets the Atlassian server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({ ATLASSIAN_MCP_URL: 'https://mcp.atlassian.test/v1/mcp/authv2' });
    expect(servers[3].url).toBe('https://mcp.atlassian.test/v1/mcp/authv2');
    expect(servers[3].connection).toBe('atlassian');
  });

  it('lets the Cloudflare server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({ CLOUDFLARE_MCP_URL: 'https://mcp.cloudflare.test/mcp' });
    expect(servers[4].url).toBe('https://mcp.cloudflare.test/mcp');
    expect(servers[4].connection).toBe('cloudflare');
  });
});
