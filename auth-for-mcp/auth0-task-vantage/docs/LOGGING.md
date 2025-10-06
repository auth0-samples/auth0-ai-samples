# 📋 Verbose Logging System

> **Quick Reference**: Set `LOG_VERBOSE=true` to enable all logging, or `LOG_<COMPONENT>=true` for specific components.
>
> **See also**: [README.md](../README.md) for main project documentation.

This project includes a lightweight, toggleable verbose logging system designed for debugging authentication, tokens, identity, and request interactions with minimal complexity and impact on existing code.

## Features

- **Global toggle**: Enable/disable all verbose logging via `LOG_VERBOSE=true`
- **Per-component toggle**: Enable logging for specific components via `LOG_<COMPONENT>=true`
- **Lightweight**: Minimal code footprint, zero dependencies
- **Runtime dynamic**: Environment variables checked on each log call (no restart needed)
- **Performance optimized**: Near-zero overhead when disabled
- **Auth-focused**: Specialized for debugging authentication flows, tokens, and identity
- **Request tracing**: Sequential request IDs for cross-component tracking
- **Token security**: Sanitized token logging (first character only)
- **Clear identification**: All logs prefixed with `[component-name]`

## Usage

### Environment Variables

```bash
# Enable all verbose logging globally
export LOG_VERBOSE=true
# Alternative: export LOG_VERBOSE=1

# Or enable specific components only
export LOG_MCP_CLIENT=true
export LOG_MCP_SERVER=true
export LOG_API_SERVER=true
export LOG_AGENT_SERVER=true  
export LOG_CHAT_HANDLER=true

# Mix and match as needed
export LOG_MCP_CLIENT=1 LOG_API_SERVER=1
```

### Runtime Usage Examples

```bash
# Start with all logging enabled
LOG_VERBOSE=true npm run dev:all

# Start with specific component logging
LOG_MCP_CLIENT=true LOG_CHAT_HANDLER=true npm run dev:all

# Start individual services with logging
LOG_MCP_SERVER=1 npm run dev:mcp
LOG_API_SERVER=true npm run dev:api
LOG_AGENT_SERVER=true npm run dev:agent
LOG_WEBAPP_SERVER=true npm run dev:webapp

# Start agent with logging
LOG_AGENT_SERVER=1 LOG_CHAT_HANDLER=1 npm run agent:start
```

### In Code

```javascript
import { createLogger } from '../utils/logger.js';

const log = createLogger('component-name');

// Log messages (only when enabled)
log.log('Operation started', { param1: 'value' });
log.warn('Warning message', { details: 'info' });
log.error('Error occurred', error);
```

## Component Names

The following components have logging integrated:

- `mcp-client` - MCP client API calls and token management
- `mcp-server` - MCP server tool execution and startup  
- `api-server` - REST API endpoint requests and responses
- `agent-server` - Agent web server and route handling
- `chat-handler` - Chat API request processing and LLM interactions

## Sample Output

When logging is enabled, you'll see auth-focused output like:

```
[mcp-server] MCP: started { port: 8080, auth: 'enabled' }
[api-server] ⚠️  Missing AUTH0_DOMAIN / AUTH0_AUDIENCE. Running with NO AUTH ❌
[agent-server] AGENT: starting { port: 3000, auth: 'enabled' }

[chat-handler] [req-1] USER: { 
  principal: 'auth0|507f1f77bcf86cd799439011', 
  token: 'e***', 
  scopes: ['openid', 'profile', 'tasks:read'], 
  query: 'Show me my tasks' 
}
[mcp-client] API GET /tasks { auth: 'e***', body: undefined }
[mcp-server] TOOL tv_list_tasks: { 
  principal: 'auth0|507f1f77bcf86cd799439011', 
  auth: 'e***', 
  args: { ownerId: 'auth0|507f1f77bcf86cd799439011' } 
}
[api-server] TASKS listed: { orgId: 'demo-org', count: 3, status: 'all' }

[mcp-client] TOKEN: cached
[mcp-client] API POST /tasks { auth: 'e***', body: { title: 'New Task', projectId: 'proj-123' } }
[api-server] TASK created: { id: '550e8400-e29b-41d4-a716-446655440000', title: 'New Task', projectId: 'proj-123', ownerId: 'auth0|507f1f77bcf86cd799439011' }
```

## Testing

```bash
# Test with all logging enabled
LOG_VERBOSE=true npm start

# Test with specific component
LOG_MCP_SERVER=true npm run dev:mcp

# Test component-specific logging
LOG_CHAT_HANDLER=1 node --input-type=module -e "
import { createLogger } from './src/utils/logger.js';
const log = createLogger('chat-handler');
log.log('Test message');
"

# Test with logging disabled (default)
npm start
```

### Key Logging Features

The logging system focuses on:

- **Authentication debugging**: Principal extraction, token validation, auth flow
- **Request tracing**: Sequential request IDs (`req-1`, `req-2`, etc.) across components
- **Token security**: Sanitized logging showing only first character (`e***`)
- **Auth configuration**: Clear startup warnings when auth is misconfigured
- **Query parameters**: Visibility into request parameters for tracing
- **Minimal noise**: Focused on essential auth/identity information only

## Implementation Details

### Logger Utility (`src/utils/logger.js`)

- **Environment variable naming**: `LOG_<COMPONENT_NAME_UPPERCASE>`
- **Character replacement**: Non-alphanumeric characters in component names become underscores
- **Runtime evaluation**: Environment variables checked on each log call (dynamic)
- **Performance**: Minimal overhead - just environment variable checks when logging
- **Output format**: `[component-name] message data...`
- **Console methods**: Uses `console.log`, `console.warn`, `console.error`

### Integration Points

Each component integrates logging with minimal code changes:

1. **Import**: `import { createLogger } from '../utils/logger.js';`
2. **Create**: `const log = createLogger('component-name');`
3. **Use**: `log.log('message', data);`

### Component Integration Status

| Component | File | Lines Added | Log Points | Focus Areas |
|-----------|------|-------------|------------|-------------|
| MCP Client | `src/mcp/client.js` | 8 | API calls, token caching | Auth token sanitization, request tracing |
| MCP Server | `src/mcp/index.js` | 5 | Tool execution, startup | Principal extraction, auth status |
| API Server | `src/api/index.js` | 4 | Entity operations | Creation logging, auth warnings |
| Agent Server | `src/agent/index.js` | 3 | Server startup | Auth configuration status |
| Chat Handler | `src/agent/chat-api-handler.js` | 6 | User requests, auth | Request IDs, user context, token sanitization |

**Total**: ~26 lines added across 5 files for focused auth/identity logging.

### What Gets Logged

#### MCP Client (`mcp-client`)
- **API Requests**: Method, path, sanitized auth token (`e***`)
- **Token Management**: Cache hits (`TOKEN: cached`), exchange operations (`TOKEN: exchanging...`)
- **Request Bodies**: Basic body information for tracing

#### MCP Server (`mcp-server`) 
- **Tool Execution**: Tool name, principal (user ID), sanitized auth token, parameters
- **Server Startup**: Port, auth status (`enabled`/`disabled`)
- **Session Context**: Principal extraction from JWT claims

#### API Server (`api-server`)
- **Entity Operations**: Project/task creation with IDs and key fields
- **Query Results**: List operations with counts and filters
- **Auth Warnings**: Missing configuration alerts

#### Agent Server (`agent-server`)
- **Server Startup**: Port, auth configuration status
- **Request Processing**: Basic server lifecycle events

#### Chat Handler (`chat-handler`)
- **User Requests**: Request IDs (`[req-1]`), principal, sanitized tokens, scopes, query text
- **Authentication Context**: User ID extraction, token validation status
- **MCP Integration**: Tool acquisition and cleanup

### Performance Characteristics

- **Disabled**: Near-zero overhead (just env var check)
- **Enabled**: Standard console output performance  
- **Memory**: No persistent state, no memory leaks
- **CPU**: Minimal - only string formatting and console calls when active
