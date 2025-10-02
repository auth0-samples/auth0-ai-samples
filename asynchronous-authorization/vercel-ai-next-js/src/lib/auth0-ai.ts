import { Auth0AI } from '@auth0/ai-vercel';
import { AccessDeniedInterrupt } from '@auth0/ai/interrupts';

import { getUser } from './auth0';

const auth0AI = new Auth0AI();

// Async Authorization flow for user confirmation
export const withAsyncAuthorization = auth0AI.withAsyncAuthorization({
  userID: async () => {
    const user = await getUser();
    return user?.sub as string;
  },
  bindingMessage: async ({ product, qty }) => `Do you want to buy ${qty} ${product}`,
  scopes: ['openid', 'product:buy'], // add any scopes you want to use with your API
  audience: process.env['SHOP_API_AUDIENCE']!,

  /**
   * When this flag is set to `block`, the execution of the tool awaits
   * until the user approves or rejects the request.
   *
   * Given the asynchronous nature of the Async Authorization flow, this mode
   * is only useful during development.
   *
   * In practice, the process that is awaiting the user confirmation
   * could crash or timeout before the user approves the request.
   */
  onAuthorizationRequest: 'block',
  onUnauthorized: async (e: Error) => {
    if (e instanceof AccessDeniedInterrupt) {
      return 'The user has denied the request';
    }
    return e.message;
  },
});
