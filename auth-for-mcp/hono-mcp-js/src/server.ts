import { toFetchResponse, toReqRes } from "fetch-to-node";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { auth0Mcp } from "./auth0";
import { AppContext, Env, Variables } from "./types";
import { requireAuth, withMcpServer } from "./utils";

const MCP_SERVER_RESOURCE_NAME = "Example Hono MCP Server";
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  logger(),
  cors({
    origin: "*", // Allow requests from any origin. Adjust as needed for production.
    exposeHeaders: ["Mcp-Session-Id"],
    allowHeaders: ["Content-Type", "mcp-session-id"],
  }),
  (c, next) => {
    const { AUTH0_AUDIENCE, AUTH0_DOMAIN, MCP_SERVER_URL } = c.env;

    if (!MCP_SERVER_URL) {
      throw new Error("MCP_SERVER_URL is required");
    }
    if (!AUTH0_DOMAIN) {
      throw new Error("AUTH0_DOMAIN is required");
    }

    return auth0Mcp({
      resourceName: MCP_SERVER_RESOURCE_NAME,
      resourceServerUrl: new URL(MCP_SERVER_URL),
      domain: AUTH0_DOMAIN,
      audience: AUTH0_AUDIENCE,
    })(c, next);
  },
);

// MCP endpoint with authentication
app.post("/mcp", requireAuth(), withMcpServer(), async (c) => {
  try {
    const { req, res } = toReqRes(c.req.raw);
    await c.get("mcpTransport")?.handleRequest(req, res, await c.req.json());
    return await toFetchResponse(res);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    return c.json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error",
      },
      id: null,
    });
  }
});

app.all("/mcp", () => {
  throw new HTTPException(405, {
    message: "Method Not Allowed",
    res: new Response("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "POST",
      },
    }),
  });
});

app.onError((err: Error, c: AppContext) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  // fallback error response (MCP routes handle their own errors)
  return c.json(
    {
      error: "Internal Server Error",
      message: err.message,
    },
    500,
  );
});

export default app;
