import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// FastMCP compatible AuthInfo type
export type FastMCPAuthSession = AuthInfo & { 
  availableTools?: string[];
  [key: string]: unknown;
};
