# 🚀 Vercel Deployment Guide

> **Back to**: [README.md](../README.md) | **See also**: [LOGGING.md](LOGGING.md) for debugging deployments

This project supports deploying all 4 Task Vantage services to Vercel as separate serverless functions. Each service runs independently and can be deployed and scaled separately.

## Services Overview

1. **API Service** (`task-vantage-api`) - REST API built with Hono + Auth0 JWT validation
2. **MCP Service** (`task-vantage-mcp`) - Model Context Protocol server with Hono + mcp-handler + Custom Token Exchange
3. **Agent Service** (`task-vantage-agent`) - LlamaIndex agent with OpenAI integration + Auth0 sessions
4. **Web App Service** (`task-vantage-webapp`) - Web application frontend with Auth0 OAuth2 flow

## Architecture

Each service is deployed as a serverless function with its own domain:
- API: `api.taskvantage.example.com`
- MCP: `mcp.taskvantage.example.com`
- Agent: `agent.taskvantage.example.com`
- Web App: `webapp.taskvantage.example.com`

## Prerequisites

1. Install Vercel CLI: `npm install -g vercel` (or use the local dev dependency)
2. Login to Vercel: `vercel login`

## Initial Setup

**Bootstrap all services at once:**
```bash
npm run bootstrap:all
```

**Or bootstrap each service individually:**
```bash
npm run bootstrap:api     # Links task-vantage-api project
npm run bootstrap:mcp     # Links task-vantage-mcp project
npm run bootstrap:agent   # Links task-vantage-agent project
npm run bootstrap:webapp  # Links task-vantage-webapp project
```

> **Note**: These scripts match the ones documented in [README.md](../README.md#available-scripts).

## Deployment

**Deploy all services sequentially:**
```bash
npm run deploy:all        # Sequential deployment (safer)
npm run deploy:parallel   # Parallel deployment (faster)
```

**Or deploy each service individually:**
```bash
npm run deploy:api     # Deploys API service
npm run deploy:mcp     # Deploys MCP service
npm run deploy:agent   # Deploys Agent service
npm run deploy:webapp  # Deploys Web App service
```

## Monitoring

**View logs for services:**
```bash
npm run logs:all       # View all service logs
npm run logs:api       # View API service logs
npm run logs:mcp       # View MCP service logs
npm run logs:agent     # View Agent service logs
npm run logs:webapp    # View Web App service logs
```

**Open deployed services in browser:**
```bash
npm run open:deployed:all     # Open all service dashboards
npm run open:deployed:api     # Open API service dashboard
npm run open:deployed:mcp     # Open MCP service dashboard
npm run open:deployed:agent   # Open Agent service dashboard
npm run open:deployed:webapp  # Open Web App service dashboard
```

> **Complete script reference**: See [README.md](../README.md#available-scripts) for all available commands.

## Configuration Files

Each service has its own Vercel configuration in its respective directory:

- `vercel/api/vercel.json` - API service configuration
- `vercel/mcp/vercel.json` - MCP service configuration
- `vercel/agent/vercel.json` - Agent service configuration
- `vercel/webapp/vercel.json` - Web App service configuration

## Environment Variables

Each Vercel project needs its environment variables configured in the Vercel dashboard:

### For each service:
1. Go to your project dashboard on vercel.com (e.g., task-vantage-api)
2. Navigate to Settings → Environment Variables
3. Add the required variables for that service

### 🔧 Deployment-Specific Variables

**Important**: When deployed to Vercel, services communicate via public URLs, not localhost:

```bash
# Local development
API_BASE_URL=http://localhost:8787
MCP_BASE_URL=http://localhost:8080

# Production deployment
API_BASE_URL=https://api.taskvantage.example.com
MCP_BASE_URL=https://mcp.taskvantage.example.com
```

### Auto-Provisioned Variables

**REDIS_URL** - Automatically provided by Vercel for all deployed services:
- ✅ **Vercel Deployment**: `REDIS_URL` is automatically set by Vercel's Redis add-on
- ⚠️ **Local Development**: Only configure `REDIS_URL` if you have a local Redis instance
- 🚫 **Not Required**: Do not manually set `REDIS_URL` in Vercel environment variables

> **Note**: Vercel automatically provisions and configures Redis storage for serverless functions. The `REDIS_URL` environment variable is injected at runtime and points to Vercel's managed Redis service.

### Required Variables by Service:

**API Service (`task-vantage-api`)**:
- `AUTH0_DOMAIN`
- `API_AUTH0_AUDIENCE`
- `API_DEFAULT_ORG`
- `LOG_VERBOSE`

**MCP Service (`task-vantage-mcp`)**:
- `AUTH0_DOMAIN`
- `API_BASE_URL` (URL of deployed API service)
- `MCP_AUTH0_AUDIENCE`
- `MCP_AUTH0_CLIENT_ID`
- `MCP_AUTH0_CLIENT_SECRET`
- `MCP_AUTH0_SUBJECT_TOKEN_TYPE`
- `MCP_AUTH0_EXCHANGE_SCOPE`
- `LOG_VERBOSE`

**Agent Service (`task-vantage-agent`)**:
- `AUTH0_DOMAIN`
- `MCP_BASE_URL` (URL of deployed MCP service)
- `AGENT_AUTH0_CLIENT_ID`
- `AGENT_AUTH0_CLIENT_SECRET`
- `AGENT_SESSION_SECRET`
- `OPENAI_API_KEY`
- `LOG_VERBOSE`

**Web App Service (`task-vantage-webapp`)**:
- `AUTH0_DOMAIN`
- `API_BASE_URL` (URL of deployed API service)
- `API_AUTH0_AUDIENCE`
- `WEBAPP_AUTH0_CLIENT_ID`
- `WEBAPP_AUTH0_CLIENT_SECRET`
- `WEBAPP_SESSION_SECRET`
- `LOG_VERBOSE`

## 🔧 How Deployment Works

### Deployment Script Breakdown

Each `deploy:*` script follows this exact pattern:
```bash
# Example: npm run deploy:api
cp -r src vercel/api/ &&           # Copy all source code
cp package*.json vercel/api/ &&   # Copy package.json + package-lock.json
cd vercel/api &&                   # Enter service directory
vercel link --project task-vantage-api --yes &&  # Link to Vercel project
vercel --prod --yes                # Deploy to production
```

### What Gets Copied

**From root directory to `vercel/[service]/`:**
- `src/` → Complete source code (all services)
- `package.json` → Dependencies and scripts
- `package-lock.json` → Exact dependency versions

**Pre-existing in each `vercel/[service]/` directory:**
- `api/index.js` → Vercel serverless function entry point
- `vercel.json` → Vercel configuration (routing, etc.)
- `.vercelignore` → Files to exclude from deployment
- `.vercel/project.json` → Project linking information (created by bootstrap)

### Serverless Function Entry Points

Each service has a minimal wrapper in `vercel/[service]/api/index.js`:

```javascript
// vercel/api/api/index.js
import createApp from '../src/api/app.js';
const app = createApp();
export default app;

// vercel/webapp/api/index.js
import createWebApp from '../src/webapp/app.js';
const app = createWebApp();
export default app;

// vercel/agent/api/index.js
import createAgentApp from '../src/agent/app.js';
const app = createAgentApp();
export default app;

// vercel/mcp/api/index.js
import createApp from '../src/mcp/app.js';
const app = createApp();
export default app;
```

> **Note**: The MCP service now uses the same Hono + mcp-handler pattern for both local development and Vercel deployment.

## 📁 Directory Structure & File Flow

### Before Deployment (Repository Structure)
```
task-vantage-demo/
├── src/                     # 📦 Source code (copied during deployment)
│   ├── api/                # API service source
│   ├── mcp/                # MCP service source
│   ├── agent/              # Agent service source
│   ├── webapp/             # Web app service source
│   └── utils/              # Shared utilities
├── vercel/                 # 🚀 Vercel deployment targets
│   ├── api/
│   │   ├── api/index.js    # 🔗 Serverless function entry point
│   │   ├── vercel.json     # ⚙️ Vercel routing config
│   │   └── .vercelignore   # 🚫 Deployment exclusions
│   ├── mcp/               # (same structure)
│   ├── agent/             # (same structure)
│   └── webapp/            # (same structure)
└── package.json           # 📋 Deployment scripts
```

### After Running `npm run deploy:api` (Example)
```
vercel/api/
├── api/index.js           # 🔗 Entry point (imports ../src/api/app.js)
├── vercel.json            # ⚙️ Routes all requests to /api
├── .vercelignore          # 🚫 Excludes .env*, node_modules, etc.
├── src/                   # 📦 COPIED: Complete source code
│   ├── api/               # ✅ API service (used by entry point)
│   ├── mcp/               # ➡️ MCP service (unused but copied)
│   ├── agent/             # ➡️ Agent service (unused but copied)
│   ├── webapp/            # ➡️ Web app (unused but copied)
│   └── utils/             # ✅ Shared utilities (used by API)
├── package.json           # 📦 COPIED: Dependencies
├── package-lock.json      # 🔒 COPIED: Exact versions
└── .vercel/
    └── project.json       # 🔗 Created by vercel link
```

### Why Copy Everything?

**Pros:**
- ✅ Simple deployment scripts (no selective copying)
- ✅ Shared utilities work across all services
- ✅ Consistent dependency resolution
- ✅ Easy to debug (complete codebase available)

**Cons:**
- ❌ Larger deployment packages
- ❌ Unused code deployed to each function

> **Design Decision**: This project prioritizes simplicity over optimization. Each service gets the complete codebase but only uses what it needs.

## Troubleshooting

### Common Issues:

**Deployment Failures:**
- Check logs: `npm run logs:[service]`
- Verify all environment variables are set in Vercel dashboard
- Ensure Node.js runtime version matches (18+ required)
- Check build logs in Vercel dashboard

**Authentication Issues:**
- Verify Auth0 domain and client credentials
- Ensure callback URLs include your Vercel domains
- Check token audience matches between services

**Service Communication:**
- Update `*_BASE_URL` environment variables to point to deployed Vercel URLs
- Verify CORS settings if needed
- Check network connectivity between services

**Environment Variables:**
- Use `vercel env add` to add variables via CLI
- Remember to redeploy after changing environment variables
- Check variable names match exactly (case-sensitive)

**Deployment Workflow Commands:**
```bash
# 1. First-time setup (creates .vercel/project.json)
npm run bootstrap:all

# 2. Deploy everything
npm run deploy:all          # Sequential (safer, ~4 minutes)
npm run deploy:parallel     # Parallel (faster, ~1 minute)

# 3. Monitor deployments
npm run logs:all            # All service logs
vercel ls                   # List all deployments
vercel --prod               # Manual deploy from service directory

# 4. Debug individual services
npm run deploy:api          # Deploy just API
npm run logs:api            # View API logs
vercel logs api.taskvantage.example.com --follow  # Live logs

# 5. Environment management
vercel env add VARIABLE_NAME          # Add variable
vercel env rm VARIABLE_NAME           # Remove variable
vercel env ls                         # List variables
```

**Project Management:**
```bash
# Link existing projects (after git clone)
vercel link --project task-vantage-api
vercel link --project task-vantage-mcp
vercel link --project task-vantage-agent
vercel link --project task-vantage-webapp

# Or use the automated script
npm run bootstrap:all
```
