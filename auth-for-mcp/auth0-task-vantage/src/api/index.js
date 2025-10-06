import { serve } from '@hono/node-server';
import * as env from './env.js';
import createApp from './app.js';

const app = createApp();

serve({ port: env.API_PORT, fetch: app.fetch });
console.log(`Task Vantage API listening on ${env.API_BASE_URL}`);
