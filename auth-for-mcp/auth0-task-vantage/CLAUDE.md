# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Task Vantage Demo is a microservices-based task management platform demonstrating Auth0 integration patterns across 4 services:

- **API Service** (`src/api/`) - Hono REST API with Auth0 JWT validation
- **MCP Service** (`src/mcp/`) - Hono server with mcp-handler + Custom Token Exchange (CTE)
- **Agent Service** (`src/agent/`) - LlamaIndex agent with OpenAI integration
- **Web App Service** (`src/webapp/`) - Frontend with Auth0 OAuth2 flow

**Unified Architecture Benefits:**
- All services use Hono framework for consistency and code reuse
- Same deployment pattern for local development and Vercel serverless
- Unified Auth0 integration patterns across all services
- DRY (Don't Repeat Yourself) principle applied throughout

Each service runs independently and communicates via HTTP APIs with bearer token authentication.

## Development Commands

### Local Development
```bash
# Start all services in parallel (opens browser tabs)
npm run dev:all

# Start individual services
npm run dev:api        # Port 8787
npm run dev:mcp        # Port 8080
npm run dev:agent      # Port 3000
npm run dev:webapp     # Port 3001

# Development with file watching
npm run dev:agent:watch
npm run dev:webapp:watch
```

### Vercel Deployment
```bash
# One-time setup (links projects)
npm run bootstrap:all

# Deploy all services
npm run deploy:all        # Sequential (safer)
npm run deploy:parallel   # Parallel (faster)

# Deploy individual services
npm run deploy:api
npm run deploy:mcp
npm run deploy:agent
npm run deploy:webapp

# Monitor deployments
npm run logs:all
npm run logs:api
npm run logs:mcp
npm run logs:agent
npm run logs:webapp
```

## Architecture Patterns

### Service Communication Flow
```
Claude Desktop → MCP Server → API Service → In-Memory Store
Web Browser → Web App → API Service → In-Memory Store
Agent UI → Agent Service → MCP Server → API Service → In-Memory Store
```

### Authentication Architecture
- **API Service**: Validates JWT tokens from Auth0 using `@auth0/auth0-api-js`
- **MCP Service**: Uses Custom Token Exchange (CTE) to convert MCP tokens → API tokens
- **Agent Service**: Uses Auth0 sessions for `/chat/*` routes, forwards tokens to MCP
- **Web App**: Uses OAuth2 Authorization Code flow, extracts access tokens for API calls

### Data Models
The API uses an in-memory store (`src/api/app.js`) with two main entities:
- **Projects**: `{ id, orgId, name, description, createdAt }`
- **Tasks**: `{ id, orgId, projectId, title, description, ownerId, dueAt, status, tags, comments, createdAt, updatedAt, createdBy }`

## Key Implementation Details

### Environment Configuration
- Each service has its own `env.js` file with environment variable handling
- Auth0 integration requires: `AUTH0_DOMAIN`, client credentials, and audience
- Services detect missing config and fall back to "no auth" mode for development

### MCP Tools Implementation
The MCP server (`src/mcp/app.js`) exposes 9 tools:
- `tv_create_project`, `tv_list_projects`
- `tv_create_task`, `tv_get_task`, `tv_list_tasks`
- `tv_update_task_status`, `tv_assign_task`, `tv_comment_task`, `tv_tag_task`
- `tv_due_soon`

All tools use Zod schemas for validation and forward requests to the API service.

### Custom Token Exchange (CTE)
The MCP service implements Auth0 CTE in `src/mcp/client.js`:
1. Caches exchanged tokens with 30-second clock skew
2. Falls back to forwarding original tokens if CTE fails
3. Extracts scopes from JWT payload for response metadata

### Logging System
Centralized logging in `src/utils/logger.js`:
- Global toggle: `LOG_VERBOSE=true`
- Per-component: `LOG_MCP_SERVER=true`, `LOG_API_SERVER=true`, etc.
- Sanitized token logging (first character only)
- Sequential request IDs for cross-service tracing

### Vercel Deployment Strategy

**Deployment Process** (see [VERCEL.md](docs/VERCEL.md) for complete details):

1. **Copy Phase**: `cp -r src vercel/[service]/` + `cp package*.json vercel/[service]/`
2. **Link Phase**: `vercel link --project task-vantage-[service] --yes`
3. **Deploy Phase**: `vercel --prod --yes`

**Key Points**:
- Each service gets the **complete** `src/` codebase (not just its own directory)
- Serverless entry points in `vercel/[service]/api/index.js` import from `../src/[service]/app.js`
- **Unified**: MCP now uses `mcp-handler` for both local development and Vercel deployment
- Environment variables must use **deployed URLs** (not localhost)
- All 4 services deploy to separate Vercel projects with individual domains

## Development Guidelines

### Adding New API Endpoints
1. Add route to `src/api/app.js` with scope checking using `requireScope()`
2. Update MCP tools in `src/mcp/app.js` if needed
3. Add corresponding Web App proxy routes in `src/webapp/app.js`

### Authentication Debugging
- Enable verbose logging: `LOG_VERBOSE=true npm run dev:all`
- Check token flows in logs (tokens are sanitized)
- Verify scope requirements match between services
- Test both authenticated and "no auth" modes

### Environment Variables
- Always update `.env.example` when adding new variables
- Document in `README.md` environment section
- Handle missing variables gracefully (service detection patterns)
- **Critical for Vercel**: Use deployed URLs in `*_BASE_URL` variables:
  ```bash
  # Local development
  API_BASE_URL=http://localhost:8787
  MCP_BASE_URL=http://localhost:8080

  # Production deployment
  API_BASE_URL=https://api.taskvantage.example.com
  MCP_BASE_URL=https://mcp.taskvantage.example.com
  ```

### Testing Authentication Flows
- **MCP**: Use Claude Desktop with MCP configuration
- **Agent**: Visit `/chat/app` for authenticated routes, `/` for public
- **Web App**: Visit `/app` for authenticated routes, `/` for public
- **API**: Test with `curl` using bearer tokens

## Service Dependencies

### Runtime Dependencies
- API: Hono, @auth0/auth0-api-js
- MCP: Hono, mcp-handler, @auth0/auth0-api-js
- Agent: LlamaIndex, @llamaindex/openai, @auth0/auth0-hono
- Web App: Hono, @auth0/auth0-hono

### Shared Utilities
- `src/utils/logger.js` - Centralized logging system
- Each service has its own `env.js` for environment handling
- Common auth patterns across services (scope checking, token forwarding)

## Troubleshooting Common Issues

### Auth0 Configuration
- Verify callback URLs match service base URLs
- Check audience matches between MCP and API services
- Ensure client credentials are for correct applications
- Test token exchange configuration separately

### Service Communication
- **Local**: Services communicate via localhost URLs
- **Vercel**: Services communicate via public Vercel URLs (see [VERCEL.md](docs/VERCEL.md#deployment-specific-variables))
- Update `*_BASE_URL` environment variables for each deployment target
- Check CORS if cross-origin issues occur
- Verify network connectivity between Vercel functions
- Use logging to trace request flows across services

### Vercel-Specific Issues
- **File copying**: All deployment scripts copy the entire `src/` directory to each service
- **Entry points**: Each service has a wrapper in `vercel/[service]/api/index.js`
- **Unified deployment**: MCP uses the same Hono + mcp-handler pattern for both local and Vercel
- **Bootstrap required**: Run `npm run bootstrap:all` after cloning to link projects
- **Environment sync**: Vercel environment variables are separate from local `.env`

### Development Environment
- Services must run on documented ports for cross-references
- Use `npm run dev:all` to ensure proper startup order
- Check that all required environment variables are set
- Test both local and deployed configurations
