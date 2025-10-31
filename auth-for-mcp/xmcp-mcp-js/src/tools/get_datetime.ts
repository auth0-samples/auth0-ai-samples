import { type ToolMetadata } from "xmcp";

/**
 * Schema definition for get_datetime tool parameters (no parameters needed).
 */
export const schema = {} as const;

/**
 * Metadata for the get_datetime tool.
 */
export const metadata: ToolMetadata = {
  name: "get_datetime",
  description: "Returns the current UTC date and time",
  annotations: {
    title: "Get DateTime",
    readOnlyHint: true,
  },
};

/**
 * Tool handler for get_datetime - returns current UTC datetime.
 * This tool does not require any scopes.
 */
export default async function handler() {
  const utcDateTime = new Date().toISOString();
  return `Current UTC DateTime: ${utcDateTime}`;
}