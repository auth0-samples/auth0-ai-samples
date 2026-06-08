import { describe, expect, it, vi } from 'vitest';

import { AccessTokenForConnectionError } from '@auth0/nextjs-auth0/errors';
import { TokenVaultInterrupt } from '@auth0/ai/interrupts';

import { getConnectionAccessToken } from './connection-token';

describe('getConnectionAccessToken', () => {
  it('returns the Token Vault access token for the connection', async () => {
    const getAccessTokenForConnection = vi.fn().mockResolvedValue({ token: 'vault-token', expiresAt: 123 });

    const token = await getConnectionAccessToken(
      { getAccessTokenForConnection } as never,
      { connection: 'notion', scopes: [] },
    );

    expect(token).toBe('vault-token');
    expect(getAccessTokenForConnection).toHaveBeenCalledWith({ connection: 'notion' });
  });

  it('raises a connect-account TokenVaultInterrupt when the account is not connected', async () => {
    const getAccessTokenForConnection = vi
      .fn()
      .mockRejectedValue(new AccessTokenForConnectionError('missing_refresh_token', 'not connected'));

    const err = await getConnectionAccessToken(
      { getAccessTokenForConnection } as never,
      { connection: 'notion', scopes: ['read'] },
    ).catch((e) => e);

    expect(TokenVaultInterrupt.isInterrupt(err)).toBe(true);
    expect(err.connection).toBe('notion');
    expect(err.requiredScopes).toEqual(['read']);
  });

  it('rethrows unrelated errors', async () => {
    const boom = new Error('network');
    const getAccessTokenForConnection = vi.fn().mockRejectedValue(boom);

    await expect(
      getConnectionAccessToken({ getAccessTokenForConnection } as never, { connection: 'notion', scopes: [] }),
    ).rejects.toBe(boom);
  });
});
