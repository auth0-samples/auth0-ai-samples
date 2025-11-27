import { z } from "zod";
import { FastMCP } from "fastmcp";
import { FastMCPAuthSession } from "./types.js";
import { checkPrivateDocumentsAccess } from "./openfga.js";
import { DocumentApi } from "./documentApi.js";

export const MCP_TOOL_SCOPES = ["tool:greet", "tool:whoami"];
const documentApi = new DocumentApi();

const emptyToolInputSchema = z.object({}).strict();

function hasAllScopes(
  toolName: string,
  requiredScopes: readonly string[]
): (auth: FastMCPAuthSession) => boolean {
  return (auth: FastMCPAuthSession) => {
    // Check if tool is in the user's available tools list
    const hasToolAccess = auth.availableTools?.includes(toolName) ?? false;
    
    // Check if user has all required scopes
    const userScopes = auth.scopes;
    const hasAllRequiredScopes = requiredScopes.every((scope) => userScopes.includes(scope));
    
    // User must have both: tool in their list AND all required scopes
    return hasToolAccess && hasAllRequiredScopes;
  };
}

export function registerTools(mcpServer: FastMCP<FastMCPAuthSession>) {
  mcpServer.addTool({
    name: "greet",
    description:
      "Greet a user with personalized authentication information from Auth0.",
    annotations: {
      title: "Greet User (FastMCP)",
      readOnlyHint: true,
    },
    parameters: z.object({
      name: z
        .string()
        .optional()
        .describe("The name of the person to greet (optional)."),
    }),
    canAccess: hasAllScopes("greet", ["tool:greet"]),
    execute: async (args, { session: authInfo }) => {
      const { name } = args;
      const userName = name ?? "there";

      console.log(`Greet tool invoked for user: ${authInfo?.extra?.sub}`);

      return {
        content: [
          {
            type: "text",
            text: `Hello, ${userName} (${authInfo?.extra?.sub})!

FastMCP with Auth0 OAuth integration is working!
Authentication and scope checks are working correctly.`.trim(),
          },
        ],
      };
    },
  });

  mcpServer.addTool({
    name: "whoami",
    description: "Returns information about the authenticated user",
    annotations: {
      title: "Who Am I? (FastMCP)",
      readOnlyHint: true,
    },
    canAccess: hasAllScopes("whoami", ["tool:whoami"]),
    execute: async (_args, { session: authInfo }) => {
      const info = { user: authInfo?.extra, scopes: authInfo?.scopes };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  });

  // This tool does not require any scopes
  mcpServer.addTool({
    name: "get_datetime",
    description: "Returns the current UTC date and time",
    annotations: {
      title: "Get DateTime",
      readOnlyHint: true,
    },
    parameters: emptyToolInputSchema,
    canAccess: hasAllScopes("get_datetime", []),
    execute: async () => {
      const utcDateTime = new Date().toISOString();
      return {
        content: [
          {
            type: "text",
            text: utcDateTime,
          },
        ],
      };
    },
  });


  // This tool does not require any scopes, but the results depend on FGA authorization. 
  mcpServer.addTool({
    name: "get_documents",
    description:  "Retrieves important documents",
    annotations: {
      title: "Get Documents",
      readOnlyHint: true,
    },
    parameters: emptyToolInputSchema,
    canAccess: hasAllScopes("get_documents", []),
    execute: async (args, { session: authInfo }) => {

      const canViewPrivate = await checkPrivateDocumentsAccess(authInfo.extra.sub);
      const documents = await documentApi.getDocuments(canViewPrivate);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: documents.length,
                filter: "public",
                documents: documents,
              }, null, 2)
          },
        ],
      };
    },
  });
}
