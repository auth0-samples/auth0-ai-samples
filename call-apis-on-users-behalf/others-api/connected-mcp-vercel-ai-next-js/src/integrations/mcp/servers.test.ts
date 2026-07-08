import { describe, expect, it } from 'vitest';

import { loadMcpServers, NOTION_MCP_SERVER, GITHUB_MCP_SERVER, LINEAR_MCP_SERVER, ATLASSIAN_MCP_SERVER, CLOUDFLARE_MCP_SERVER, SENTRY_MCP_SERVER, ASANA_MCP_SERVER, SLACK_MCP_SERVER, SALESFORCE_MCP_SERVER, SNOWFLAKE_MCP_SERVER, HUBSPOT_MCP_SERVER, DATADOG_MCP_SERVER, GMAIL_MCP_SERVER, GCALENDAR_MCP_SERVER, GDRIVE_MCP_SERVER } from './servers';

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
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'notion,github,linear,atlassian,cloudflare,sentry,asana,slack,salesforce,snowflake,hubspot,datadog,gmail,gcalendar,gdrive',
      SNOWFLAKE_MCP_URL: 'https://myorg-myaccount.snowflakecomputing.com/api/v2/databases/DB/schemas/PUBLIC/mcp-servers/MY_MCP',
      DATADOG_MCP_URL: 'https://mcp.us5.datadoghq.com/v1/mcp',
    });
    expect(servers).toHaveLength(15);
    expect(servers).toContainEqual(NOTION_MCP_SERVER);
    expect(servers).toContainEqual(GITHUB_MCP_SERVER);
    expect(servers).toContainEqual(LINEAR_MCP_SERVER);
    expect(servers).toContainEqual(ATLASSIAN_MCP_SERVER);
    expect(servers).toContainEqual(CLOUDFLARE_MCP_SERVER);
    expect(servers).toContainEqual(SENTRY_MCP_SERVER);
    expect(servers).toContainEqual(ASANA_MCP_SERVER);
    expect(servers).toContainEqual(SLACK_MCP_SERVER);
    expect(servers).toContainEqual(SALESFORCE_MCP_SERVER);
    expect(servers).toContainEqual(HUBSPOT_MCP_SERVER);
    expect(servers).toContainEqual(GMAIL_MCP_SERVER);
    expect(servers).toContainEqual(GCALENDAR_MCP_SERVER);
    expect(servers).toContainEqual(GDRIVE_MCP_SERVER);
    expect(servers.find(s => s.connection === 'datadog')).toBeDefined();
  });

  it('pairs each server with an Auth0 connection used for the Token Vault exchange', () => {
    const snowflakeUrl = 'https://myorg-myaccount.snowflakecomputing.com/api/v2/databases/DB/schemas/PUBLIC/mcp-servers/MY_MCP';
    const datadogUrl = 'https://mcp.us5.datadoghq.com/v1/mcp';
    const [notion, github, linear, atlassian, cloudflare, sentry, asana, slack, salesforce, snowflake, hubspot, datadog, gmail, gcalendar, gdrive] = loadMcpServers({
      ENABLED_MCP_SERVERS: 'notion,github,linear,atlassian,cloudflare,sentry,asana,slack,salesforce,snowflake,hubspot,datadog,gmail,gcalendar,gdrive',
      SNOWFLAKE_MCP_URL: snowflakeUrl,
      DATADOG_MCP_URL: datadogUrl,
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
    expect(sentry.connection).toBe('sentry');
    expect(sentry.url).toBe('https://mcp.sentry.dev/mcp');
    expect(asana.connection).toBe('asana');
    expect(asana.url).toBe('https://mcp.asana.com/v2/mcp');
    expect(slack.connection).toBe('slack');
    expect(slack.url).toBe('https://mcp.slack.com/mcp');
    expect(salesforce.connection).toBe('salesforce');
    expect(salesforce.url).toBe('https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads');
    expect(snowflake.connection).toBe('snowflake');
    expect(snowflake.url).toBe(snowflakeUrl);
    expect(hubspot.connection).toBe('hubspot');
    expect(hubspot.url).toBe('https://mcp.hubspot.com');
    expect(datadog.connection).toBe('datadog');
    expect(datadog.url).toBe(datadogUrl);
    expect(gmail.connection).toBe('google-workspace');
    expect(gmail.url).toBe('https://gmailmcp.googleapis.com/mcp/v1');
    expect(gcalendar.connection).toBe('google-workspace');
    expect(gcalendar.url).toBe('https://calendarmcp.googleapis.com/mcp/v1');
    expect(gdrive.connection).toBe('google-workspace');
    expect(gdrive.url).toBe('https://drivemcp.googleapis.com/mcp/v1');
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

  it('lets the Sentry server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'sentry',
      SENTRY_MCP_URL: 'https://mcp.sentry.test/mcp',
    });
    expect(servers[0].url).toBe('https://mcp.sentry.test/mcp');
    expect(servers[0].connection).toBe('sentry');
  });

  it('lets the Asana server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'asana',
      ASANA_MCP_URL: 'https://mcp.asana.test/mcp',
    });
    expect(servers[0].url).toBe('https://mcp.asana.test/mcp');
    expect(servers[0].connection).toBe('asana');
  });

  it('lets the Slack server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'slack',
      SLACK_MCP_URL: 'https://mcp.slack.test/mcp',
    });
    expect(servers[0].url).toBe('https://mcp.slack.test/mcp');
    expect(servers[0].connection).toBe('slack');
  });

  it('lets the Salesforce server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'salesforce',
      SALESFORCE_MCP_URL: 'https://api.salesforce.test/platform/mcp/v1/platform/sobject-reads',
    });
    expect(servers[0].url).toBe('https://api.salesforce.test/platform/mcp/v1/platform/sobject-reads');
    expect(servers[0].connection).toBe('salesforce');
  });

  it('lets the HubSpot server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'hubspot',
      HUBSPOT_MCP_URL: 'https://mcp.hubspot.test',
    });
    expect(servers[0].url).toBe('https://mcp.hubspot.test');
    expect(servers[0].connection).toBe('hubspot');
  });

  it('lets the Datadog server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'datadog',
      DATADOG_MCP_URL: 'https://mcp.datadoghq.com/v1/mcp?toolsets=all',
    });
    expect(servers[0].url).toBe('https://mcp.datadoghq.com/v1/mcp?toolsets=all');
    expect(servers[0].connection).toBe('datadog');
  });

  it('lets the Gmail server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'gmail',
      GMAIL_MCP_URL: 'https://gmailmcp.googleapis.test/mcp/v1',
    });
    expect(servers[0].url).toBe('https://gmailmcp.googleapis.test/mcp/v1');
    expect(servers[0].connection).toBe('google-workspace');
  });

  it('lets the Google Calendar server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'gcalendar',
      GCALENDAR_MCP_URL: 'https://calendarmcp.googleapis.test/mcp/v1',
    });
    expect(servers[0].url).toBe('https://calendarmcp.googleapis.test/mcp/v1');
    expect(servers[0].connection).toBe('google-workspace');
  });

  it('lets the Google Drive server URL be overridden via env without touching the connection', () => {
    const servers = loadMcpServers({
      ENABLED_MCP_SERVERS: 'gdrive',
      GDRIVE_MCP_URL: 'https://drivemcp.googleapis.test/mcp/v1',
    });
    expect(servers[0].url).toBe('https://drivemcp.googleapis.test/mcp/v1');
    expect(servers[0].connection).toBe('google-workspace');
  });

  it('requires SNOWFLAKE_MCP_URL since Snowflake has no default URL', () => {
    const url = 'https://myorg-myaccount.snowflakecomputing.com/api/v2/databases/DB/schemas/PUBLIC/mcp-servers/MY_MCP';
    const servers = loadMcpServers({ ENABLED_MCP_SERVERS: 'snowflake', SNOWFLAKE_MCP_URL: url });
    expect(servers[0].connection).toBe('snowflake');
    expect(servers[0].url).toBe(url);
  });
});
