import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";
import auth0Mcp from "../auth0";

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
 * Greet tool with Auth0 scope-based authorization, following the XMCP tool export convention.
 */
export default auth0Mcp.requireScopes(
  ["tool:greet"],
  async ({ name = "there" }: InferSchema<typeof schema>) => {
    console.log(`Greet tool invoked with name: ${name}`);

    return {
      content: [
        {
          type: "text",
          text: `
  Hello, ${name}!

  XMCP with Auth0 OAuth integration working!
  Authentication handled by XMCP's built-in OAuth support
  This tool demonstrates XMCP framework integration
`.trim(),
        },
      ],
    };
  }
);
