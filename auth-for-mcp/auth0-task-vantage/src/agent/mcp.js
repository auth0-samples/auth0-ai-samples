import * as env from './env.js';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLogger } from '../utils/logger.js';

const log = createLogger('mcp-client');

/**
 * MCP client with metadata tracking
 * Creates connection, provides tools and call method, tracks metadata, handles cleanup
 */
export async function createMCPClient(accessToken = null) {
  const mcpUrl = `${env.MCP_BASE_URL}/mcp`;
  log.log(`Connecting to MCP server:`, { url: mcpUrl, hasToken: !!accessToken });

  let transport;
  let client;

  // Metadata tracking
  let exchangedScopes = null;
  let tokenExchangeTime = null;

  try {
    // Create transport with optional authentication
    const transportOptions = {};
    if (accessToken) {
      transportOptions.authProvider = {
        async tokens() {
          return {
            access_token: accessToken,
            token_type: "Bearer",
          };
        }
      };
    }

    transport = new StreamableHTTPClientTransport(new URL(mcpUrl), transportOptions);

    client = new Client({
      name: "task-vantage-agent",
      version: "1.0.0",
    });

    // Connect and get tools
    await client.connect(transport);
    const toolsResult = await client.listTools();
    log.log(`Discovered ${toolsResult.tools?.length || 0} MCP tools`);

    const tools = toolsResult.tools || [];

    return {
      tools,
      callTool: async (name, args) => {
        log.log(`Calling MCP tool:`, {
          tool: name,
          argCount: Object.keys(args || {}).length,
          token: accessToken ? `${accessToken[0]}***` : 'none'
        });

        const startTime = Date.now();

        // Track token exchange timing on first call with access token
        const needsTokenExchange = accessToken && tokenExchangeTime === null;
        const exchangeStartTime = needsTokenExchange ? Date.now() : null;

        try {
          const result = await client.callTool({ name, arguments: args });

          // Capture token exchange time if this was the first call
          if (needsTokenExchange && exchangeStartTime) {
            tokenExchangeTime = Date.now() - exchangeStartTime;
          }

          // Extract scopes from first tool response with metadata
          if (!exchangedScopes && result?.content?.[0]?.text) {
            try {
              const parsed = JSON.parse(result.content[0].text);
              if (parsed?._metadata?.exchangedScopes) {
                exchangedScopes = parsed._metadata.exchangedScopes;
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }

          const duration = Date.now() - startTime;

          log.log(`MCP tool completed:`, {
            tool: name,
            success: true,
            duration: `${duration}ms`
          });

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          log.error(`MCP tool failed:`, {
            tool: name,
            error: error.message,
            duration: `${duration}ms`
          });
          throw error;
        }
      },
      getMetadata: () => ({
        exchangedScopes,
        tokenExchangeTime
      }),
      cleanup: async () => {
        try {
          if (client) await client.close();
          if (transport) await transport.close();
        } catch (error) {
          log.error("Cleanup error:", error.message);
        }
      }
    };

  } catch (error) {
    log.error("MCP connection failed:", error.message);
    if (client) await client.close().catch(() => {});
    if (transport) await transport.close().catch(() => {});
    throw error;
  }
}