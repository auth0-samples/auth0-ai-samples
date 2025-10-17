/**
 * OAuth 2.0 Protected Resource Metadata endpoint
 */
import { ProtectedResourceMetadataBuilder } from '@auth0/auth0-api-js';

import { AUTH0_DOMAIN, MCP_SERVER_URL, corsHeaders } from '../../../config';

const handler = () => {
  const metadata = new ProtectedResourceMetadataBuilder(MCP_SERVER_URL, [
    `https://${AUTH0_DOMAIN}/`,
  ])
    .withJwksUri(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
    .withScopesSupported([
      // OIDC scopes
      'openid',
      'profile',
      'email',

      // tool scopes
      'tool:greet',
      'tool:whoami',
    ])
    .build();

  return new Response(JSON.stringify(metadata.toJSON()), {
    headers: corsHeaders,
  });
};

// Create the OPTIONS handler for CORS preflight requests
// This alllows browsers to make cross-origin requests to this endpoint
const optionsHandler = () => {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
};

// Export the handlers using Nextjs App router naming convention
// GET: Returns the protected resource metadata JSON
// OPTIONS: Handles CORS preflight requests
export { handler as GET, optionsHandler as OPTIONS };
