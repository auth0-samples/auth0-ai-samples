import type { Auth0Client } from '@auth0/nextjs-auth0/server';
import { AccessTokenForConnectionError } from '@auth0/nextjs-auth0/errors';
import { TokenVaultInterrupt } from '@auth0/ai/interrupts';

type ConnectionRef = {
  connection: string;
  scopes: string[];
};

/**
 * Performs the Token Vault Exchange: trades the user's Auth0 session for a
 * federated access token scoped to the given Connection's external AS.
 *
 * If the user has not yet connected that account, Auth0 cannot mint a token, so
 * we raise a TokenVaultInterrupt with behavior "reload". The chat UI catches it,
 * renders the connect-account consent, and re-runs the request once connected.
 */
export async function getConnectionAccessToken(auth0: Auth0Client, { connection, scopes }: ConnectionRef): Promise<string> {
  try {
    const { token } = await auth0.getAccessTokenForConnection({ connection });
    return token;
  } catch (error) {
    if (error instanceof AccessTokenForConnectionError) {
      throw new TokenVaultInterrupt(`Authorization required to connect your "${connection}" account`, {
        connection,
        scopes,
        requiredScopes: scopes,
        behavior: 'reload',
      });
    }
    throw error;
  }
}
