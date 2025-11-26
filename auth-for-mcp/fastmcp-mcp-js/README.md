# Example FastMCP MCP Server with Auth0 Integration

This is a practical example of securing a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs) server
with Auth0 using the [FastMCP](https://github.com/punkpeye/fastmcp) TypeScript framework. It demonstrates
real-world OAuth 2.0 and OIDC integration with JWT token verification and scope enforcement.

## Available Tools

The server exposes the following tools:

- `whoami` - Returns authenticated user information and granted scopes
- `greet` - Personalized greeting demonstrating authenticated tool access
- `get_datetime` - Returns the current UTC date and time (no scope required)

## Install dependencies

Install the dependencies using npm:

```bash
npm install
```

## Auth0 Tenant Setup

### Pre-requisites:
1. **Auth0 CLI**: This guide uses [Auth0 CLI](https://auth0.github.io/auth0-cli/) to configure an Auth0 tenant for secure MCP tool access. If you don't have it, you can follow the [Auth0 CLI installation instructions](https://auth0.github.io/auth0-cli/) to set it up. Alternatively, all the following configuration steps can be done through the [Auth0 Management Dashboard](https://manage.auth0.com/).

2. **Enable Resource Parameter Compatibility Profile**: The Model Context Protocol (MCP) specification requires the use of the standards-compliant resource parameter as defined in RFC 8707. To use the `resource` parameter in your access tokens, you need to enable the compatibility profile. Follow the [Enable Resource Parameter Compatibility Profile](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile) to enable it.

### Step 1: Authenticate with Auth0 CLI

First, you need to log in to the Auth0 CLI with the correct scopes to manage all the necessary resources.

1. Run the login command: This command will open a browser window for you to authenticate. We are requesting a set of
   scopes to configure APIs, roles, and clients.

```
auth0 login --scopes "read:client_grants,create:client_grants,delete:client_grants,read:clients,create:clients,update:clients,read:resource_servers,create:resource_servers,update:resource_servers,read:roles,create:roles,update:roles,update:tenant_settings,read:connections,update:connections"
```

2. Verify your tenant: After logging in, confirm you are operating on the tenant you want to configure.

```
auth0 tenants list
```

### Step 2: Configure Tenant Settings

Next, enable tenant-level flags required for Dynamic Client Registration (DCR) and an improved user consent experience.

- `enable_dynamic_client_registration`: Allows MCP tools to register themselves as applications automatically.
  [Learn more](https://auth0.com/docs/get-started/applications/dynamic-client-registration#enable-dynamic-client-registration)
- `use_scope_descriptions_for_consent`: Shows user-friendly descriptions for scopes on the consent screen.
  [Learn more](https://auth0.com/docs/customize/login-pages/customize-consent-prompts).

Execute the following command to enable the above mentioned flags through the tenant settings:

```
auth0 tenant-settings update set flags.enable_dynamic_client_registration flags.use_scope_descriptions_for_consent
```

### Step 3: Promote Connections to Domain Level

[Learn more](https://auth0.com/docs/authenticate/identity-providers/promote-connections-to-domain-level) about promoting
connections to domain level.

1. List your connections to get their IDs: `auth0 api get connections`
2. From the list, identify only the connections that should be available to be used with third party applications. For each of those specific connection IDs, run the following command to mark it as a domain-level connection. Replace `YOUR_CONNECTION_ID` with the actual ID (e.g., `con_XXXXXXXXXXXXXXXX`)

```
auth0 api patch connections/YOUR_CONNECTION_ID --data '{"is_domain_connection": true}'
```

### Step 4: Configure the API

This step creates the API (also known as a Resource Server) that represents your protected MCP Server and sets it as the
default for your tenant.

1. Create the API: This command registers the API with Auth0, defines its signing algorithm, enables Role-Based Access
   Control (RBAC), and specifies the available scopes. Replace `http://localhost:3001/` and `MCP Tools API`
   with your desired identifier and name. Add your tool-specific scopes to the scopes array.

   Note that `rfc9068_profile_authz` is used instead of `rfc9068_profile` as the token dialect to enable RBAC. [Learn more](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis#token-dialect-options)

```
auth0 api post resource-servers --data '{
  "identifier": "http://localhost:3001/",
  "name": "MCP Tools API",
  "signing_alg": "RS256",
  "token_dialect": "rfc9068_profile_authz",
  "enforce_policies": true,
  "scopes": [
    {"value": "tool:whoami", "description": "Access the WhoAmI tool"},
    {"value": "tool:greet", "description": "Access the Greeting tool"}
  ]
}'
```

### Step 5: Configure RBAC Roles and Permissions

Now, set up roles and assign permissions to them. This allows you to control which users can access which tools, using the core Auth0 RBAC features. If you want to learn how to implement authorization using Auth0 FGA, check the [FastMCP FGA example](../fastmcp-mcp-fga-js/).

1. Create Roles: For each role you need (e.g., "Tool Administrator", "Tool User"), run the create command.

```
# Example for an admin role
auth0 roles create --name "Tool Administrator" --description "Grants access to all MCP tools"

# Example for a basic user role
auth0 roles create --name "Tool User" --description "Grants access to basic MCP tools"
```

2. Assign Permissions to Roles: After creating roles, note the ID from the output (e.g. `rol_`) and and assign the API
   permissions to it. Replace `YOUR_ROLE_ID`, `http://localhost:3001/`, and the list of scopes.

```
# Example for admin role (all scopes)
auth0 roles permissions add YOUR_ADMIN_ROLE_ID --api-id "http://localhost:3001/" --permissions "tool:whoami,tool:greet"

# Example for user role (one scope)
auth0 roles permissions add YOUR_USER_ROLE_ID --api-id "http://localhost:3001/" --permissions "tool:whoami"
```

3. Assign Roles to Users: Find users and assign them to the roles.

```
# Find a user's ID
auth0 users search --query "email:\"example@google.com\""

# Assign the role using the user's ID and the role's ID
auth0 users roles assign "auth0|USER_ID_HERE" --roles "YOUR_ROLE_ID_HERE"
```

**Note:** Further customization not supported out of the box by RBAC can be done via a custom Post-Login action trigger.

## Configuration

Rename `.env.example` to `.env` and configure the domain and audience:

```
# Auth0 tenant domain
AUTH0_DOMAIN=example-tenant.us.auth0.com

# Auth0 API Identifier
AUTH0_AUDIENCE=http://localhost:3001/
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
