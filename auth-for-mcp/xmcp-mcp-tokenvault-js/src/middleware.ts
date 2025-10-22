import { Middleware } from "xmcp/dist/types/middleware";
import auth0Mcp from "./auth0";

export default [
  auth0Mcp.protectedResourceMetadataMiddleware(),
  auth0Mcp.authMiddleware()
] as Middleware[];
