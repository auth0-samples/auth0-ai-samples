import { type XmcpConfig } from "xmcp";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const config: XmcpConfig = {
  paths: {
    prompts: false,
    resources: false,
  },
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
};

export default config;
