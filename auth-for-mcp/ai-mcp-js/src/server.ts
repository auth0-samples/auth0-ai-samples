import { createServer } from "node:http";
import { loadMcpServerConfig } from "./config.js";
import { createMcpApp } from "./mcp-app.js";

const config = loadMcpServerConfig();
const app = createMcpApp(config);
createServer((req, res) => void app(req, res)).listen(config.port, () => {
  console.log(`MCP server listening on port ${config.port}`);
});
