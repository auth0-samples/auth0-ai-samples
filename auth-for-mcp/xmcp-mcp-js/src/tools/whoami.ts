import { getAuthInfo } from "@xmcp-dev/auth0";
import { InferSchema, type ToolMetadata } from "xmcp";

/**
 * Schema definition for whoami tool parameters.
 * This tool takes no parameters.
 */
export const schema = {} as const;

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
 * Whoami tool handler using the official @xmcp-dev/auth0 plugin.
 * Returns authenticated user information.
 */
export default async function handler(_params: InferSchema<typeof schema>) {
  const authInfo = await getAuthInfo();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            user: authInfo.user,
            permissions: authInfo.permissions,
            expiresAt: authInfo.expiresAt,
          },
          null,
          2,
        ),
      },
    ],
  };
}
