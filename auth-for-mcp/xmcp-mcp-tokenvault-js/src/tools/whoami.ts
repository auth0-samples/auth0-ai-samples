import { InferSchema, type ToolMetadata } from "xmcp";
import { getAuthInfo } from "@xmcp-dev/auth0";

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
 * Whoami tool with Auth0 authentication using official xmcp plugin.
 */
export default async function whoami(_params: InferSchema<typeof schema>) {
  const authInfo = getAuthInfo();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            user: authInfo.user,
            scopes: authInfo.scopes,
          },
          null,
          2,
        ),
      },
    ],
  };
}
