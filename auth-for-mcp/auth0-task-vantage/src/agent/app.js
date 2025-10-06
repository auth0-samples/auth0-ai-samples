import * as env from './env.js';
import { Hono } from "hono";
import { auth } from '@auth0/auth0-hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { handleChat } from './agent.js';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('agent-server');

export default function createAgentApp() {
  const app = new Hono();

  // Cache HTML files at startup
  const htmlCache = new Map();
  const htmlFiles = ['home.html', 'chat.html'];

  htmlFiles.forEach(file => {
    try {
      const content = fs.readFileSync(path.join(process.cwd(), 'src/agent/public', file), 'utf-8');
      htmlCache.set(file, content);
      log.log(`Cached HTML file: ${file}`);
    } catch (error) {
      log.error(`Failed to cache HTML file ${file}:`, error.message);
    }
  });

  // Auth middleware for /chat/* routes
  app.use('/chat/*', auth({
    enabled: env.AUTH_ENABLED,
    domain: env.AUTH0_DOMAIN,
    clientID: env.AGENT_AUTH0_CLIENT_ID,
    clientSecret: env.AGENT_AUTH0_CLIENT_SECRET,
    baseURL: env.AGENT_BASE_URL,
    session: {
      secret: env.AGENT_SESSION_SECRET,
    },
    routes: {
      callback: '/chat/callback',
    },
    authorizationParams: {
      audience: env.MCP_AUTH0_AUDIENCE,
    },
    scope: 'openid profile email'
  }));

  // Chat API endpoint
  app.post("/chat/api", handleChat);

  // Public home page
  app.get("/", (c) => c.html(htmlCache.get('home.html') || '<h1>Home page not found</h1>'));

  // Authenticated chat UI
  app.get("/chat/app", (c) => c.html(htmlCache.get('chat.html') || '<h1>Chat page not found</h1>'));

  // Logout endpoint with federated logout
  app.get('/chat/logout', async (c) => {
    const client = c.var?.auth0Client;
    if (client) {
      // Clear local session
      await client.logout({}, c);

      // Redirect to Auth0 logout with federated parameter
      const logoutUrl = `https://${env.AUTH0_DOMAIN}/v2/logout?federated&returnTo=${encodeURIComponent(env.AGENT_BASE_URL)}&client_id=${env.AGENT_AUTH0_CLIENT_ID}`;
      return c.redirect(logoutUrl);
    }

    return c.redirect('/');
  });

  // Static file serving (must be last)
  app.use('/*', serveStatic({ root: './src/agent/public' }));

  return app;
}