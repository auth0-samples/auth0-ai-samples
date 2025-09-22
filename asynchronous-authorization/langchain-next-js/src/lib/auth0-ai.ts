import { Auth0AI } from '@auth0/ai-langchain';
import { AccessDeniedInterrupt } from '@auth0/ai/interrupts';

const auth0AI = new Auth0AI();

// CIBA flow for user confirmation
export const withAsyncAuthorization = auth0AI.withAsyncUserConfirmation({
  userID: async (_params, config) => {
    // return config?.configurable?._credentials?.user?.sub;
    return config.configurable?.langgraph_auth_user?.sub;
  },
  bindingMessage: async ({ product, qty }) => `Do you want to buy ${qty} ${product}`,
  scopes: ['openid', 'product:buy'], // add any scopes you want to use with your API
  audience: process.env['SHOP_API_AUDIENCE']!,


  /**
   * Note: setting a requestedExpiry to >= 301 will currently ensure email is used. Otherwise,
   * the default is to use push notification if available.
  */
  // requestedExpiry: 301,

  /**
   * When this flag is set to `block`, the execution of the tool awaits
   * until the user approves or rejects the request.
   *
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
