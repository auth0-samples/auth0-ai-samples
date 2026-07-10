import { afterEach, describe, expect, it, vi } from 'vitest';

const createMCPClient = vi.fn();
vi.mock('@ai-sdk/mcp', () => ({
  createMCPClient: (...args: unknown[]) => createMCPClient(...args),
}));

import { TokenVaultError } from '@auth0/ai/interrupts';
import { connectMcpServer } from './client';

afterEach(() => {
  vi.clearAllMocks();
});

describe('connectMcpServer', () => {
  it('opens an HTTP transport to the server URL with the Token Vault token as a Bearer header', async () => {
    const tools = vi.fn().mockResolvedValue({ 'notion-search': {} });
    createMCPClient.mockResolvedValue({ tools, close: vi.fn() });

    await connectMcpServer({
      url: 'https://mcp.notion.com/mcp',
      connection: 'notion',
      accessToken: 'vault-access-token',
    });

    expect(createMCPClient).toHaveBeenCalledTimes(1);
    const config = createMCPClient.mock.calls[0][0];
    expect(config.transport).toMatchObject({
      type: 'http',
      url: 'https://mcp.notion.com/mcp',
      headers: { Authorization: 'Bearer vault-access-token' },
    });
  });

  it('returns the tools discovered from the MCP server plus a close handle', async () => {
    const discovered = { 'notion-search': {}, 'notion-fetch': {} };
    const close = vi.fn();
    createMCPClient.mockResolvedValue({ tools: vi.fn().mockResolvedValue(discovered), close });

    const { tools, close: closeHandle } = await connectMcpServer({
      url: 'https://mcp.notion.com/mcp',
      connection: 'notion',
      accessToken: 'vault-access-token',
    });

    expect(tools).toBe(discovered);
    await closeHandle();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('raises a TokenVaultError when the MCP server rejects the token (401)', async () => {
    createMCPClient.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );

    await expect(
      connectMcpServer({
        url: 'https://mcp.notion.com/mcp',
        connection: 'notion',
        accessToken: 'expired-token',
      }),
    ).rejects.toBeInstanceOf(TokenVaultError);
  });

  it('rethrows non-auth errors unchanged', async () => {
    const boom = new Error('network down');
    createMCPClient.mockRejectedValue(boom);

    await expect(
      connectMcpServer({
        url: 'https://mcp.notion.com/mcp',
        connection: 'notion',
        accessToken: 'vault-access-token',
      }),
    ).rejects.toBe(boom);
  });

  it('raises a TokenVaultError when the server rejects the token lazily during tool discovery', async () => {
    const close = vi.fn();
    const tools = vi.fn().mockRejectedValue(
      Object.assign(new Error('Forbidden'), { statusCode: 403 }),
    );
    createMCPClient.mockResolvedValue({ tools, close });

    await expect(
      connectMcpServer({
        url: 'https://mcp.notion.com/mcp',
        connection: 'notion',
        accessToken: 'expired-token',
      }),
    ).rejects.toBeInstanceOf(TokenVaultError);
  });

  it('closes the client when tool discovery fails so the connection does not leak', async () => {
    const close = vi.fn();
    const boom = new Error('discovery failed');
    createMCPClient.mockResolvedValue({ tools: vi.fn().mockRejectedValue(boom), close });

    await expect(
      connectMcpServer({
        url: 'https://mcp.notion.com/mcp',
        connection: 'notion',
        accessToken: 'vault-access-token',
      }),
    ).rejects.toBe(boom);

    expect(close).toHaveBeenCalledTimes(1);
  });
});
