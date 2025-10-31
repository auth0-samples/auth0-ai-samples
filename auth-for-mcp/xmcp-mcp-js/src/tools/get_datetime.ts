import { InferSchema, type ToolMetadata } from "xmcp";

/**
 * Schema definition for get_datetime tool parameters, following the XMCP tool export convention.
 * This tool takes no parameters.
 */
export const schema = {
  // Empty object schema for tools that take no parameters
} as const;

/**
 * Metadata for the get_datetime tool.
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
};

/**
 * Tool handler for get_datetime - returns current UTC datetime.
 * This tool does not require any scopes.
 */
export default async function handler(_params: InferSchema<typeof schema>) {
  const utcDateTime = new Date().toISOString();
  return {
    content: [
      {
        type: "text",
        text: utcDateTime,
      },
    ],
  };
}