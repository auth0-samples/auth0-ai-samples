/**
 * FGA Authorization Module
 * 
 * This module provides authorization checks using Auth0 FGA/OpenFGA for fine-grained access control.
 * It replaces the scope-based authorization with relationship-based authorization.
 * 
 * The FGA model (model.fga) defines the following relationships:
 * - Users can be assigned to groups
 * - Roles can be assigned to users or group members
 * - Tools (greet_tool, whoami_tool, get_datetime_tool, get_documents_tool) define "can_use" relations
 * - The get_documents_tool also defines "can_view_private_documents" relation
 * 
 * Setup:
 * 1. Set up an Auth0 FGA store (https:/fga.dev)
 * 2. Upload the authorization model from model.fga
 * 3. Configure environment variables:
 *    - FGA_API_URL: The Auth0 FGA API endpoint (e.g., https://api.us1.fga.dev)
 *    - FGA_STORE_ID: The store ID
 *    - FGA_API_TOKEN_ISSUER: Token issuer (auth.fga.dev)
 *    - FGA_API_AUDIENCE: API audience
 *    - FGA_CLIENT_ID: Client credentials client ID
 *    - FGA_CLIENT_SECRET: Client credentials client secret
 * 4. Create tuples in OpenFGA to grant users access to tools:
 *    Example: user:auth0|123 -> role#assignee -> role:admin
 *             role:admin#assignee -> can_use -> greet_tool:greet
 */
import { OpenFgaClient, CredentialsMethod, ConsistencyPreference } from "@openfga/sdk";

// Check if FGA authorization is enabled (defaults to false)
export const FGA_AUTHORIZATION_ENABLED = process.env.FGA_AUTHORIZATION_ENABLED === 'true';

const FGA_API_URL = process.env.FGA_API_URL;
const FGA_STORE_ID = process.env.FGA_STORE_ID;
const FGA_API_TOKEN_ISSUER = process.env.FGA_API_TOKEN_ISSUER;
const FGA_API_AUDIENCE = process.env.FGA_API_AUDIENCE;
const FGA_CLIENT_ID = process.env.FGA_CLIENT_ID;
const FGA_CLIENT_SECRET = process.env.FGA_CLIENT_SECRET;

let fgaClient: OpenFgaClient | null = null;

if (FGA_AUTHORIZATION_ENABLED) {
  if (!FGA_API_URL || !FGA_STORE_ID || !FGA_API_TOKEN_ISSUER || !FGA_API_AUDIENCE || !FGA_CLIENT_ID || !FGA_CLIENT_SECRET) {
    throw new Error(
      "FGA configuration missing: When FGA_AUTHORIZATION_ENABLED=true, FGA_API_URL, FGA_STORE_ID, FGA_API_TOKEN_ISSUER, FGA_API_AUDIENCE, FGA_CLIENT_ID, and FGA_CLIENT_SECRET are required"
    );
  }

  // Initialize OpenFGA client with Auth0 FGA credentials
  fgaClient = new OpenFgaClient({
    apiUrl: FGA_API_URL,
    storeId: FGA_STORE_ID,
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        apiTokenIssuer: FGA_API_TOKEN_ISSUER,
        apiAudience: FGA_API_AUDIENCE,
        clientId: FGA_CLIENT_ID,
        clientSecret: FGA_CLIENT_SECRET,
      },
    },
  });
  console.log('[FGA] Authorization enabled');
} else {
  console.log('[FGA] Authorization disabled - all tools will be available to authenticated users');
}


/**
 * Get all tools that a user can access using OpenFGA
 * @param userId - The user's ID (from Auth0 sub claim)
 * @returns Promise<string[]> - Array of tool names the user can access
 */
export async function getTools(userId: string): Promise<string[]> {
  if (!fgaClient) {
    throw new Error('[FGA] Client not initialized - cannot retrieve tools');
  }

  try {
    // Get current time in RFC 3339 format for temporal access conditions
    const currentTime = new Date().toISOString();

    // Define all available tools to check
    const toolNames = ['greet', 'whoami', 'get_datetime', 'get_documents'];

    // Prepare batch check requests for all tools
    const checks = toolNames.map((toolName) => ({
      user: `user:${userId}`,
      relation: "can_use",
      object: `tool:${toolName}`,
      context: {
        current_time: currentTime,
      },
    }));

    const response = await fgaClient.batchCheck(
      { checks },
      {
        // We are using higher consistency because when testing the MCP, you'll want changes
        // in Auth0FGA to be reflected immediately. In production, you might choose ConsistencyPreference.MinimizeLatency for better performance.
        consistency: ConsistencyPreference.HigherConsistency,
      }
    );

    // Map results back to tool names by matching the request and response
    const allowedTools: string[] = [];
    
    response.result?.forEach((checkResult) => {
      if (checkResult.allowed) {
        // Extract tool name from the object field (format: "tool:toolname")
        const toolName = checkResult.request?.object?.replace("tool:", "");
        if (toolName) {
          allowedTools.push(toolName);
        }
      }
    });
    
    console.log(`[FGA] User ${userId} has access to tools:`, allowedTools);
    
    return allowedTools;
  } catch (error) {
    console.error(
      `[FGA] Error checking tools for user ${userId}:`,
      error
    );
    return [];
  }
}

/**
 * Check if a user can view private documents using OpenFGA
 * @param userId - The user's ID (from Auth0 sub claim)
 * @returns Promise<boolean> - True if user can view private documents, false otherwise
 */
export async function checkPrivateDocumentsAccess(
  userId: string
): Promise<boolean> {
  if (!fgaClient) {
    throw new Error('[FGA] Client not initialized - cannot retrieve tools');
  }

  try {
    // Get current time in RFC 3339 format for temporal access conditions
    const currentTime = new Date().toISOString();

    const { allowed } = await fgaClient.check(
      {
        user: `user:${userId}`,
        relation: "can_view_private_documents",
        object: `tool:get_documents`,
        context: {
          current_time: currentTime,
        },
      },
      {
        consistency: ConsistencyPreference.HigherConsistency,
      }
    );

    return allowed ?? false;
  } catch (error) {
    console.error(
      `Error checking OpenFGA private documents access for user ${userId}:`,
      error
    );
    return false;
  }
}

export { fgaClient };
