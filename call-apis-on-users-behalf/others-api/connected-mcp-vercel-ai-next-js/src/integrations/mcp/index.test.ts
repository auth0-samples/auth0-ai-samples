import { afterEach, describe, expect, it, vi } from 'vitest';

const connectMcpServer = vi.fn();
const getConnectionAccessToken = vi.fn();
let mcpServers = [{ connection: 'notion', url: 'https://mcp.notion.com/mcp', scopes: [] as string[] }];

vi.mock('./client', () => ({ connectMcpServer: (...a: unknown[]) => connectMcpServer(...a) }));
vi.mock('./connection-token', () => ({
  getConnectionAccessToken: (...a: unknown[]) => getConnectionAccessToken(...a),
}));
vi.mock('./servers', () => ({
  loadMcpServers: () => mcpServers,
}));

import { collectMcpTools } from './index';

afterEach(() => {
  vi.clearAllMocks();
  mcpServers = [{ connection: 'notion', url: 'https://mcp.notion.com/mcp', scopes: [] }];
});

describe('collectMcpTools', () => {
  it('fetches the Token Vault token then opens the MCP server with it', async () => {
    getConnectionAccessToken.mockResolvedValue('vault-token');
    connectMcpServer.mockResolvedValue({ tools: { 'notion-search': {} }, close: vi.fn() });

    const { tools } = await collectMcpTools({} as never);

    expect(getConnectionAccessToken).toHaveBeenCalledWith(expect.anything(), {
      connection: 'notion',
      scopes: [],
    });
    expect(connectMcpServer).toHaveBeenCalledWith({
      url: 'https://mcp.notion.com/mcp',
      connection: 'notion',
      accessToken: 'vault-token',
    });
    expect(tools).toHaveProperty('notion-search');
  });

  it('exposes a close that tears down every opened server', async () => {
    getConnectionAccessToken.mockResolvedValue('vault-token');
    const close = vi.fn();
    connectMcpServer.mockResolvedValue({ tools: {}, close });

    const { close: closeAll } = await collectMcpTools({} as never);
    await closeAll();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('propagates a connect-account interrupt from the token fetch', async () => {
    const interrupt = new Error('connect required');
    getConnectionAccessToken.mockRejectedValue(interrupt);

    await expect(collectMcpTools({} as never)).rejects.toBe(interrupt);
    expect(connectMcpServer).not.toHaveBeenCalled();
  });

  it('closes already-opened servers when a later server fails mid-loop', async () => {
    mcpServers = [
      { connection: 'notion', url: 'https://mcp.notion.com/mcp', scopes: [] },
      { connection: 'github', url: 'https://mcp.github.com/mcp', scopes: [] },
    ];
    getConnectionAccessToken.mockResolvedValue('vault-token');

    const firstClose = vi.fn();
    const boom = new Error('second server unreachable');
    connectMcpServer
      .mockResolvedValueOnce({ tools: { 'notion-search': {} }, close: firstClose })
      .mockRejectedValueOnce(boom);

    await expect(collectMcpTools({} as never)).rejects.toBe(boom);
    expect(firstClose).toHaveBeenCalledTimes(1);
  });
});
