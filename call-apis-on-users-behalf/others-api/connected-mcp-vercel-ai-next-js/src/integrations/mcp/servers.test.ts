import { describe, expect, it } from 'vitest';

import { loadMcpServers, NOTION_MCP_SERVER, GITHUB_MCP_SERVER, LINEAR_MCP_SERVER, ATLASSIAN_MCP_SERVER, CLOUDFLARE_MCP_SERVER } from './servers';

describe('loadMcpServers', () => {
  it('defaults to Notion only when ENABLED_MCP_SERVERS is not set', () => {
    const servers = loadMcpServers({});
    expect(servers).toHaveLength(1);
    expect(servers[0]).toEqual(NOTION_MCP_SERVER);
  });

  it('loads only the servers listed in ENABLED_MCP_SERVERS', () => {
    const servers = loadMcpServers({ ENABLED_MCP_SERVERS: 'github,linear' });
    expect(servers).toHaveLength(2);
    expect(servers[0]).toEqual(GITHUB_MCP_SERVER);
    expect(servers[1]).toEqual(LINEAR_MCP_SERVER);
  });

  it('loads all servers when all connection names are listed', () => {
    const servers = loadMcpServers({ ENABLED_MCP_SERVERS: 'notion,github,linear,atlassian,cloudflare' });
    expect(servers).toHaveLength(5);
    expect(servers[0]).toEqual(NOTION_MCP_SERVER);
    expect(servers[1]).toEqual(GITHUB_MCP_SERVER);
    expect(servers[2]).toEqual(LINEAR_MCP_SERVER);
    expect(servers[3]).toEqual(ATLASSIAN_MCP_SERVER);
    expect(servers[4]).toEqual(CLOUDFLARE_MCP_SERVER);
  });

  it('pairs each server with an Auth0 connection used for the Token Vault exchange', () => {
    const [notion, github, linear, atlassian, cloudflare] = loadMcpServers({
      ENABLED_MCP_SERVERS: 'notion,github,linear,atlassian,cloudflare',
    });
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
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'github',
      GITHUB_MCP_URL: 'https://api.githubcopilot.test/mcp',
    });
    expect(servers[0].url).toBe('https://api.githubcopilot.test/mcp');
    expect(servers[0].connection).toBe('github');
  });

  it('lets the Linear server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'linear',
      LINEAR_MCP_URL: 'https://mcp.linear.test/mcp',
    });
    expect(servers[0].url).toBe('https://mcp.linear.test/mcp');
    expect(servers[0].connection).toBe('linear');
  });

  it('lets the Atlassian server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'atlassian',
      ATLASSIAN_MCP_URL: 'https://mcp.atlassian.test/v1/mcp/authv2',
    });
    expect(servers[0].url).toBe('https://mcp.atlassian.test/v1/mcp/authv2');
    expect(servers[0].connection).toBe('atlassian');
  });

  it('lets the Cloudflare server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'cloudflare',
      CLOUDFLARE_MCP_URL: 'https://mcp.cloudflare.test/mcp',
    });
    expect(servers[0].url).toBe('https://mcp.cloudflare.test/mcp');
    expect(servers[0].connection).toBe('cloudflare');
  });
});
