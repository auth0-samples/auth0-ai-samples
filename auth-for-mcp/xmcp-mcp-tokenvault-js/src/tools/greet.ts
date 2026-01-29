import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { getAuthInfo } from "@xmcp-dev/auth0";

/**
 * Schema definition for greet tool parameters, following the XMCP tool export convention.
 */
export const schema = {
  name: z
    .string()
    .optional()
    .describe("The name of the person to greet (optional)"),
} as const;

/**
 * Metadata for the greet tool, following the XMCP tool export convention.
 */
export const metadata: ToolMetadata = {
  name: "greet",
  description:
    "Greet a user with personalized authentication information from Auth0",
  annotations: {
    title: "Greet User",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
} as const;

/**
 * Greet tool with Auth0 authentication using official xmcp plugin.
 */
export default async function greet({
  name = "there",
}: InferSchema<typeof schema>) {
  console.log(`Greet tool invoked with name: ${name}`);

  const authInfo = getAuthInfo();
  const displayName = authInfo.user.name ?? name;

  return {
    content: [
      {
        type: "text",
        text: `
Hello, ${displayName}!

XMCP with Auth0 OAuth integration working!
Authentication handled by official @xmcp-dev/auth0 plugin.
`.trim(),
      },
    ],
  };
}
