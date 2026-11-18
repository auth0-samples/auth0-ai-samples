import { FastMCP } from "fastmcp";
import type { Logger } from "fastmcp";
// Quickstart: import type { Auth0Session, FastMcpAuth } from "@auth0/ai-fastmcp" here.
// Quickstart: import createAuth from "./auth.js" here.
import type { AppConfig } from "./config.js";
import { registerTools } from "./tools.js";

/**
 * Builds the MCP server: FastMCP and the tools. The starter has no authentication, so every
 * request is accepted.
 */
// Quickstart: add an `auth?: FastMcpAuth` field to the options and type the server as FastMCP<Auth0Session> here.
export function createApp(
  config: AppConfig,
  options: { logger?: Logger } = {},
): FastMCP {
  const server = new FastMCP({
    name: "orders-example",
    version: "0.1.0",
    // Quickstart: spread the Auth0 options here: ...(options.auth ?? createAuth(config)),
    ...(options.logger !== undefined && { logger: options.logger }),
  });
  registerTools(server, config);
  return server;
}
