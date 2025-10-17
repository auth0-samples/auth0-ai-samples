/**
 * Exports the Hono app directly for Cloudflare Workers deployment.
 * This follows the standard Hono pattern for Workers where the app
 * is instantiated once and reused across requests.
 */

import app from "./server";

/**
 * @returns Hono app configured for Cloudflare Workers deployment
 */
export default app;
