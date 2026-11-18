import { loadAppConfig } from "./config.js";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";

const config = loadAppConfig();
const auth = createAuth(config);
const server = createApp(config, { auth });
await server.start({
  transportType: "httpStream",
  httpStream: { endpoint: auth.endpoint, port: config.port, stateless: true },
});
console.log(`MCP server listening on port ${config.port} at ${auth.endpoint}`);
