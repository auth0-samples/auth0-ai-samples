# Example FastMCP MCP Server with Auth0 Integration

This example demonstrates how to create a FastMCP MCP server that uses Auth0 for authentication using the `auth0-api-python` library.

## Install dependencies

```
poetry install
```

## Auth0 Tenant Setup

### Pre-requisites:

This guide uses [Auth0 CLI](https://auth0.github.io/auth0-cli/) to configure an Auth0 tenant for secure MCP tool access. If you don't have it, you can follow the [Auth0 CLI installation instructions](https://auth0.github.io/auth0-cli/) to set it up. Alternatively, all the following configuration steps can be done through the [Auth0 Management Dashboard](https://manage.auth0.com/).

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

### Step 4: Configure the API and Default Audience

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

2. Set the Default Audience: This ensures that users logging in interactively get access tokens that are valid for your
   newly created MCP Server. Replace `http://localhost:3001/` with the same API identifier you used above.

   **Note:** This step is currently required but temporary. Without setting a default audience, the issued access tokens will not be scoped specifically to your MCP resource server. Support for RFC 8707 (Resource Indicators for OAuth 2.0) is coming soon, which will provide proper resource targeting. Once available, these instructions will be updated to explain how to enable support for RFC 8707 instead of the default audience approach.

```
auth0 api patch "tenants/settings" --data '{"default_audience": "http://localhost:3001/"}'
```

### Step 5: Configure RBAC Roles and Permissions

Now, set up roles and assign permissions to them. This allows you to control which users can access which tools.

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
poetry run python -m src.server
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
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "curl-test", "version": "1.0.0"}}}'
```

**Note:** Use the MCP Inspector or other MCP-compatible clients for comprehensive testing.
