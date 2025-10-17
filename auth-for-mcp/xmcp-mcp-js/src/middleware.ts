import { RequestHandlerAndRouter } from "xmcp/dist/types/middleware";
import auth0Mcp from "./auth0";

const middlewareAndRouter: RequestHandlerAndRouter = {
  middleware: auth0Mcp.authMiddleware(),
  router: auth0Mcp.authMetadataRouter(),
};

export default middlewareAndRouter;
