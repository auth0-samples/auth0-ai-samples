import { getAuthInfo } from "@xmcp-dev/auth0";
import { z } from "zod";
import { type ToolMetadata } from "xmcp";
import { type InferSchema } from "xmcp";

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
 * Greet tool handler using the official @xmcp-dev/auth0 plugin.
 */
export default async function greet({
  name = "there",
}: InferSchema<typeof schema>) {
  const authInfo = getAuthInfo();

  return {
    content: [
      {
        type: "text",
        text: `
Hello, ${name}!

XMCP with Auth0 OAuth integration working!
Authenticated as: ${authInfo.user.name}
This tool demonstrates the official @xmcp-dev/auth0 plugin
`.trim(),
      },
    ],
  };
}
