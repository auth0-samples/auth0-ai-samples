# Example FastMCP MCP Server with Auth0 and Auth0 FGA Integration

This is a practical example of securing a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs) server
with Auth0 using the [FastMCP](https://github.com/punkpeye/fastmcp) TypeScript framework. 

 This repository shows a minimal but realistic integration with:
 - OAuth 2.0 / OIDC via Auth0 for authentication and token verification
 - Auth0 FGA (OpenFGA) for fine-grained Resource Authorization
 - FastMCP for exposing tools as MCP endpoints

 This example uses an authorization model defined in [`fga/model.fga`](./fga/model.fga) that supports:

- **Public Tools**: Accessible to all authenticated users (e.g., `get_datetime`)
- **Role-Based Access**: Tools assigned to specific roles
- **Group Membership**: Users inherit permissions through group membership
- **Temporal Access**: Time-limited tool access with automatic expiration
- **Resource-Specific Permissions**: Fine-grained access (e.g., viewing private documents)

 ## Prerequisites

 - Node.js 18+ 
 - npm (or a compatible package manager)
 - An Auth0 tenant (for OAuth and token verification)
 - An Auth0 FGA account (OpenFGA / fga.dev) for authorization model and tuples
 - `fga` CLI (optional, for bootstrapping the model and tuples)

## Available Tools

The server exposes the following tools:

- `whoami` - Returns authenticated user information and granted scopes
- `greet` - Personalized greeting demonstrating authenticated tool access
- `get_datetime`  Returns the current UTC date and time (no scope required)
- `get_documents` - Returns a list of documents from a mock API. Depending on the user role, it will return private documents or not.

## Install dependencies

Install the dependencies using npm:

```bash
npm install
```

## Auth0 Tenant Setup

For detailed instructions on setting up your Auth0 tenant for MCP server integration, please refer to the [Auth0 Tenant Setup guide](https://github.com/auth0-samples/auth0-ai-samples/tree/main/auth-for-mcp/fastmcp-mcp-js/README.md#auth0-tenant-setup) in the FastMCP example.

## Auth0 FGA Setup 

Auth0 FGA provides fine-grained authorization using [Relationship-Based Access Control (ReBAC)](https://docs.fga.dev/concepts#what-is-relationship-based-access-control-rebac). It's built on [OpenFGA](https://openfga.dev), a CNCF incubation project, and offers more flexible authorization patterns than traditional RBAC.

### Prerequisites

1. **Create an Auth0 FGA Account**: Sign up for free at [fga.dev](https://fga.dev)
2. **Generate API Credentials**: Follow [this guide](https://docs.fga.dev/intro/settings) to create credentials with full permissions
3. **Install the FGA CLI**:
   ```bash
   # macOS
   brew install openfga/tap/fga
   
   # Other platforms - download from:
   # https://github.com/openfga/cli/releases
   ```

### CLI Configuration

After creating your FGA credentials, export the following (provided during credential creation):

   ```bash
   export FGA_API_URL='https://api.us1.fga.dev'
   export FGA_STORE_ID='<your-store-id>'
   export FGA_API_TOKEN_ISSUER='auth.fga.dev'
   export FGA_API_AUDIENCE='https://api.us1.fga.dev/'
   export FGA_CLIENT_ID='<your-client-id>'
   export FGA_CLIENT_SECRET='<your-client-secret>'
   ```

### Authorization Model


### Initial Setup

1. **Deploy the Authorization Model**:
   ```bash
   fga model write --file ./fga/model.fga
   ```

2. **Import Initial Data**: The [`fga/tuples.yaml`](./fga/tuples.yaml) file defines:
   - Two roles: `admin` and `content_manager`
   - Two groups: `marketing` (content_manager role) and `managers` (admin role)
   - Tool permissions:
     - Everyone: `get_datetime`
     - Admin & Content Manager: `greet`, `whoami`, `get_documents`
     - Admin only: Can view private documents

   Import the tuples:
   ```bash
   fga tuple write --file ./fga/tuples.yaml
   ```

### Managing User Access

Use the provided scripts to manage user permissions dynamically:

#### Add User to Group
Grants all permissions associated with the group:

```bash
# Add user to managers group (admin role - full access including private documents)
./fga/add-user-to-group.sh user@example.com managers

# Add user to marketing group (content_manager role - no private document access)
./fga/add-user-to-group.sh user@example.com marketing
```

#### Remove User from Group
Revokes group-based permissions:

```bash
./fga/remove-user-from-group.sh user@example.com managers
```

#### Grant Temporary Access
Provides time-limited access to specific tools:

```bash
# Grant 20-second access to the greet tool
./fga/add-temporal-access.sh user@example.com greet 20s

# Grant 1-hour access
./fga/add-temporal-access.sh user@example.com greet 1h
```

Temporal access automatically expires.

### Testing Access Changes

After modifying permissions, test with different users to verify:

1. **Managers Group** (admin role):
   - Should see: `get_datetime`, `greet`, `whoami`, `get_documents`
   - Can view: All documents (public + private)

2. **Marketing Group** (content_manager role):
   - Should see: `get_datetime`, `greet`, `whoami`, `get_documents`
   - Can view: Public documents only

3. **User with Temporal Access**:
   - Should see: `get_datetime` + temporarily granted tool
   - Access expires after specified duration

4. **User with No Assignments**:
   - Should see: `get_datetime` only

You can also manage tuples directly in the [Auth0 FGA Dashboard](https://dashboard.fga.dev) for.

## Configuration

Rename `.env.example` to `.env` and configure the domain and audience:

```
# Auth0 tenant domain
AUTH0_DOMAIN=example-tenant.us.auth0.com

# Auth0 API Identifier
AUTH0_AUDIENCE=http://localhost:3001/

# FGA Configuration
FGA_API_URL='https://api.us1.fga.dev'
FGA_STORE_ID=<store_id>
FGA_API_TOKEN_ISSUER='auth.fga.dev'
FGA_API_AUDIENCE='https://api.us1.fga.dev/'
FGA_CLIENT_ID='<client_secret>'
FGA_CLIENT_SECRET='<client_secret>'
```

With the configuration in place, the example can be started by running:

```bash
npm run start
```

## Testing

Use an MCP client like [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server interactively:

```bash
npx @modelcontextprotocol/inspector
```

The server will start up and the UI will be accessible at http://localhost:6274.

In the MCP Inspector, select `Streamable HTTP` as the `Transport Type`, enter `http://localhost:3001/mcp` as the URL, and select `Via Proxy` for `Connection Type`.

### Using cURL

You can use cURL to verify that the server is running:

```bash
# Test that the server is running and accessible - check OAuth resource metadata
curl -v http://localhost:3001/.well-known/oauth-protected-resource

# Test MCP initialization (requires valid Auth0 access token)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "curl-test", "version": "1.0.0"}}}'

# Test get_datetime tool (no scope required) - outputs ISO string like 2025-10-31T14:12:03.123Z
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_datetime", "arguments": {}}}'
```
