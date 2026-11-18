import { loadAppConfig } from "./config.js";
import { createApp } from "./app.js";
// Quickstart: import createAuth from "./auth.js" here.

const config = loadAppConfig();
// Quickstart: create the Auth0 options here with createAuth(config), and pass them to createApp.
const server = createApp(config);
// Quickstart: use auth.endpoint instead of the fixed route below.
const endpoint = "/mcp";
await server.start({
  transportType: "httpStream",
  httpStream: { endpoint, port: config.port, stateless: true },
});
console.log(`MCP server listening on port ${config.port} at ${endpoint}`);
