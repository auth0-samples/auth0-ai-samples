import { FunctionTool } from "llamaindex";
import { createMCPClient } from './mcp.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('tools-manager');

// Helper functions for tool call tracking
function trackToolStart(tool, args, capturedToolCalls) {
  const toolCallIndex = capturedToolCalls.length;
  capturedToolCalls.push({
    name: tool.name,
    description: tool.description,
    parameters: args,
    parameterCount: Object.keys(args || {}).length,
    startTime: Date.now(),
    status: 'running'
  });
  return toolCallIndex;
}

function trackToolSuccess(toolCallIndex, result, startTime, capturedToolCalls) {
  const endTime = Date.now();
  const duration = endTime - startTime;

  // Extract response data for UI display
  let responseData = null;
  let resultCount = null;

  try {
    if (result?.content?.[0]?.text) {
      const text = result.content[0].text;
      try {
        const parsed = JSON.parse(text);
        responseData = parsed;
        // Extract result count if it's an array or has obvious count fields
        if (Array.isArray(parsed)) {
          resultCount = parsed.length;
        } else if (parsed?.results && Array.isArray(parsed.results)) {
          resultCount = parsed.results.length;
        } else if (parsed?.data && Array.isArray(parsed.data)) {
          resultCount = parsed.data.length;
        } else if (parsed?.items && Array.isArray(parsed.items)) {
          resultCount = parsed.items.length;
        }
      } catch (parseError) {
        responseData = text.length > 200 ? text.substring(0, 200) + '...' : text;
      }
    }
  } catch (e) {
    // Ignore response extraction errors
  }

  // Update tool call with results
  capturedToolCalls[toolCallIndex] = {
    ...capturedToolCalls[toolCallIndex],
    status: 'success',
    duration,
    resultSize: JSON.stringify(result).length,
    resultCount,
    responseData,
    endTime
  };
}

function trackToolError(toolCallIndex, error, startTime, capturedToolCalls) {
  const endTime = Date.now();
  const duration = endTime - startTime;

  capturedToolCalls[toolCallIndex] = {
    ...capturedToolCalls[toolCallIndex],
    status: 'error',
    duration,
    error: error.message,
    endTime
  };
}

function wrapToolWithMetadata(tool, capturedToolCalls, isLocal = true) {
  return async (args) => {
    const toolCallIndex = trackToolStart(tool, args, capturedToolCalls);
    const startTime = Date.now();

    try {
      const result = await tool.handler(args);
      trackToolSuccess(toolCallIndex, result, startTime, capturedToolCalls);
      log.log(`${isLocal ? 'Local' : 'MCP'} tool completed:`, {
        tool: tool.name,
        duration: `${Date.now() - startTime}ms`
      });
      return result;
    } catch (error) {
      trackToolError(toolCallIndex, error, startTime, capturedToolCalls);
      log.error(`${isLocal ? 'Local' : 'MCP'} tool failed:`, {
        tool: tool.name,
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  };
}

// Local tool definitions
const localTools = [
  {
    name: 'get_current_time',
    description: 'Get the current date and time in ISO format',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    handler: async () => ({
      content: [{ type: 'text', text: new Date().toISOString() }]
    })
  },
  {
    name: 'calculate',
    description: 'Perform basic mathematical calculations (use with caution)',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")'
        }
      },
      required: ['expression'],
      additionalProperties: false
    },
    handler: async ({ expression }) => {
      try {
        // Basic math evaluation - in production use a proper math parser
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
        const result = Function('"use strict"; return (' + sanitized + ')')();
        return {
          content: [{ type: 'text', text: `${expression} = ${result}` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error evaluating expression: ${error.message}` }]
        };
      }
    }
  }
];

/**
 * Creates all available tools (local + MCP) for the agent with metadata tracking
 * Returns tools array, metadata collector, and cleanup function
 */
export async function createTools(accessToken) {
  const cleanup = [];
  const tools = [];
  const capturedToolCalls = [];

  // Metadata collector
  const metadata = {
    mcpClient: null,
    toolCalls: capturedToolCalls,
    getMetadata: () => metadata.mcpClient?.getMetadata() || { exchangedScopes: null, tokenExchangeTime: null }
  };

  // Add local tools first
  const localFunctionTools = localTools.map(tool =>
    FunctionTool.from(
      wrapToolWithMetadata(tool, capturedToolCalls, true),
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    )
  );

  tools.push(...localFunctionTools);
  log.log(`Added ${localFunctionTools.length} local tools`);

  // Add MCP tools if available
  try {
    const mcpClient = await createMCPClient(accessToken);
    cleanup.push(mcpClient.cleanup);
    metadata.mcpClient = mcpClient;

    const mcpFunctionTools = mcpClient.tools.map(tool => {
      const mcpTool = {
        name: tool.name,
        description: tool.description,
        handler: (args) => mcpClient.callTool(tool.name, args)
      };

      return FunctionTool.from(
        wrapToolWithMetadata(mcpTool, capturedToolCalls, false),
        {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.inputSchema || {}
        }
      );
    });

    tools.push(...mcpFunctionTools);
    log.log(`Added ${mcpFunctionTools.length} MCP tools`);

  } catch (error) {
    log.warn('MCP tools unavailable:', error.message);
  }

  log.log(`Total tools available: ${tools.length}`);

  return {
    tools,
    metadata,
    cleanup: async () => {
      for (const cleanupFn of cleanup) {
        try {
          await cleanupFn();
        } catch (error) {
          log.error('Tool cleanup error:', error.message);
        }
      }
    }
  };
}