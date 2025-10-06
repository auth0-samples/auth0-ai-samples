import * as env from './env.js';
import createApp from "./app.js";
import {createLogger} from "../utils/logger.js";
import { serve } from '@hono/node-server';

const log = createLogger('mcp-server');
const app = createApp();

serve({
  fetch: app.fetch,
  port: env.MCP_PORT,
});

log.log('MCP: started', { baseUrl: env.MCP_BASE_URL, auth: env.AUTH_ENABLED ? 'enabled' : 'disabled' });
console.log(`Task Vantage MCP listening on ${env.MCP_BASE_URL}/mcp`);
