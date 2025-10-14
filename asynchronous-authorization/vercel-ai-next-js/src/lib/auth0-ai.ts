import { Auth0AI } from '@auth0/ai-vercel';
import { AccessDeniedInterrupt } from '@auth0/ai/interrupts';

import { getUser } from './auth0';

const auth0AI = new Auth0AI();

// CIBA flow for user confirmation
export const withAsyncAuthorization = auth0AI.withAsyncAuthorization({
  userID: async () => {
    const user = await getUser();
    return user?.sub as string;
  },
  bindingMessage: async ({ product, qty }) => `Do you want to buy ${qty} ${product}`,
  scopes: ['openid', 'buy:product'], // add any scopes you want to use with your API
  audience: process.env['SHOP_API_AUDIENCE']!,
  /**
   * Note: Setting a requested expiry greater than 300 (seconds) will force email verification
   * instead of using the push notification flow.
   */
  // requestedExpiry: 301,

  /**
   * The behavior when the authorization request is made.
   * 
   * - `block`: The tool execution is blocked until the user completes the authorization.
   * - `interrupt`: The tool execution is interrupted until the user completes the authorization.
   * - a callback: Same as "block" but give access to the auth request and executing logic.
   * 
   * Defaults to `interrupt`.
   *
   * When this flag is set to `block`, the execution of the tool awaits
   * until the user approves or rejects the request.
   * Given the asynchronous nature of the CIBA flow, this mode
   * is only useful during development.
   *
   * In practice, the process that is awaiting the user confirmation
   * could crash or timeout before the user approves the request.
   */
  onAuthorizationRequest: async (authReq, creds) => {
    console.log(`An authorization request was sent to your mobile device or your email.`);
    await creds;
    console.log(`Thanks for approving the order.`);
  },

  onUnauthorized: async (e: Error) => {
    if (e instanceof AccessDeniedInterrupt) {
      return 'The user has denied the request';
    }
    return e.message;
  },
});
