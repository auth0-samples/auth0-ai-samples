import { InferSchema, type ToolMetadata } from "xmcp";
import auth0Mcp from "../auth0";

/**
 * Schema definition for whoami tool parameters, following the XMCP tool export convention.
 * This tool takes no parameters, but exporting it for consistency.
 */
export const schema = {
  // Empty object schema for tools that take no parameters
} as const;

/**
 * Metadata for the whoami tool, following the XMCP tool export convention.
 */
export const metadata: ToolMetadata = {
  name: "whoami",
  description: "Returns information about the authenticated user",
  annotations: {
    title: "Who Am I?",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
} as const;

/**
 * Whoami tool with Auth0 scope-based authorization, following the XMCP tool export convention.
 */
export default auth0Mcp.requireScopes(
  ["tool:whoami"],
  async (_params: InferSchema<typeof schema>, { authInfo }) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              user: authInfo.extra,
              scopes: authInfo.scopes,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);
