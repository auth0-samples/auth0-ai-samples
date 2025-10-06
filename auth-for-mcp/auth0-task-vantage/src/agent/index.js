import { serve } from '@hono/node-server';
import * as env from './env.js';
import createApp from './app.js';

const app = createApp();

serve({ port: env.AGENT_PORT, fetch: app.fetch });

console.log(`Task Vantage Agent listening on ${env.AGENT_BASE_URL}`);
console.log(`Chat UI: ${env.AGENT_BASE_URL}/chat/app`);
if (env.AUTH_ENABLED) console.log('Auth0 enabled for /chat/*');
