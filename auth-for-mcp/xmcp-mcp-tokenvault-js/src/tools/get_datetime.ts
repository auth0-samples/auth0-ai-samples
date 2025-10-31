import { InferSchema, type ToolMetadata } from "xmcp";

/**
 * Schema definition for get_datetime tool parameters, following the XMCP tool export convention.
 * This tool takes no parameters.
 */
export const schema = {
  // Empty object schema for tools that take no parameters
} as const;

/**
 * Metadata for the get_datetime tool, following the XMCP tool export convention.
 */
export const metadata: ToolMetadata = {
  name: "get_datetime",
  description: "Returns the current UTC date and time",
  annotations: {
    title: "Get DateTime",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
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
        text: utcDateTime,
      },
    ],
  };
};