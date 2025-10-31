import { InferSchema, type ToolMetadata } from "xmcp";

/**
 * Schema definition for get_datetime tool parameters, following the XMCP tool export convention.
 * This tool takes no parameters, but exporting it for consistency.
 */
export const schema = {} as const;

/**
 * Metadata for the get_datetime tool, following the XMCP tool export convention.
 */
export const metadata: ToolMetadata = {
  name: "get_datetime",
  description: "Returns the current UTC datetime in ISO 8601 format",
  annotations: {
    title: "Get Current DateTime",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
} as const;

/**
 * Get datetime tool that returns current UTC datetime, following the XMCP tool export convention.
 * This tool does not require any scopes.
 */
export default async (_params: InferSchema<typeof schema>) => {
  const now = new Date();
  const utcDateTime = now.toISOString();

  return {
    content: [
      {
        type: "text",
        text: `Current UTC DateTime: ${utcDateTime}`,
      },
    ],
  };
};