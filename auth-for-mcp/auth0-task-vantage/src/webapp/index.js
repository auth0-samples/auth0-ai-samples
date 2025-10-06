import * as env from './env.js';
import { serve } from '@hono/node-server';
import createWebApp from './app.js';

const isAuth0Configured = !!(env.AUTH0_DOMAIN && env.WEBAPP_AUTH0_CLIENT_ID && env.WEBAPP_AUTH0_CLIENT_SECRET && env.WEBAPP_SESSION_SECRET);

const app = createWebApp();

// Start the server
console.log(`Starting Task Vantage Web App on port ${env.WEBAPP_PORT}`);
console.log(`Home page available at: ${env.WEBAPP_BASE_URL}`);
console.log(`Dashboard available at: ${env.WEBAPP_BASE_URL}/app`);
console.log(`Will connect to API at: ${env.API_BASE_URL}`);
console.log(`Auth0 configured: ${isAuth0Configured ? '✅' : '❌'}`);
if (isAuth0Configured) {
  console.log(`Using BASE_URL: ${env.WEBAPP_BASE_URL}`);
  console.log(`Authentication required for: /app/*`);
  console.log(`Requesting scopes: openid profile email projects:read projects:write tasks:read tasks:write`);
  console.log(`API audience: ${env.API_AUTH0_AUDIENCE}`);
}

serve({
  fetch: app.fetch,
  port: Number(env.WEBAPP_PORT),
});
