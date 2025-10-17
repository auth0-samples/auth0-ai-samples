import { type XmcpConfig } from "xmcp";
import { PORT } from "./src/config.ts";

const config: XmcpConfig = {
  http: {
    port: PORT,
    endpoint: "/",
    cors: {
      origin: [
        "*", // Allow all origins - adjust as needed for production
      ],
      exposedHeaders: ["Mcp-Session-Id"],
      allowedHeaders: ["Content-Type", "mcp-session-id"],
      credentials: true, // Allow auth headers for Auth0 authentication from MCP Inspector
    },
  },
  paths: {
    prompts: false,
    resources: false,
    tools: './src/tools'
  }
};

export default config;
