import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import type { OrdersApiConfig } from "./config.js";
import { createOrdersData } from "./orders-data.js";
import type { OrdersData } from "./orders-data.js";
import { READ_ORDERS, WRITE_ORDERS } from "./scopes.js";

/**
 * A small orders service. Every request is verified before it reaches any data: the signature
 * (from the tenant's JWKS), the issuer, the audience of this service, the expiry, the subject and
 * the scope. Each answer includes a `verified` block that names what was checked, never the token.
 * The subject of the verified token decides whose orders the request reads and cancels.
 */

interface Verified {
  audience: string;
  scope: string;
  actor: string | null;
  subject: string;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function bearerToken(req: IncomingMessage): string | undefined {
  const match = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/.exec(req.headers.authorization ?? "");
  return match?.[1];
}

/** The `sub` of the `act` claim: the client that acts for the user in an exchanged token. */
function actorOf(payload: JWTPayload): string | null {
  const act = payload["act"];
  if (act && typeof act === "object") {
    const sub = (act as { sub?: unknown }).sub;
    if (typeof sub === "string") return sub;
  }
  return null;
}

export function createOrdersListener(
  config: OrdersApiConfig,
  keys?: JWTVerifyGetKey,
  data: OrdersData = createOrdersData(),
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const issuer = `https://${config.domain}/`;
  const getKey = keys ?? createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

  /** Verifies the token of the request. Answers the error itself and returns nothing on failure. */
  async function verify(req: IncomingMessage, res: ServerResponse, requiredScope: string): Promise<Verified | undefined> {
    const token = bearerToken(req);
    const invalid = () =>
      send(res, 401, { error: "invalid_token" }, {
        "www-authenticate": token === undefined ? "Bearer" : 'Bearer error="invalid_token"',
      });
    if (token === undefined) {
      invalid();
      return undefined;
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, getKey, {
        issuer,
        audience: config.ordersAudience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "sub"],
      }));
    } catch {
      invalid();
      return undefined;
    }
    const scopes = typeof payload["scope"] === "string" ? payload["scope"].split(/\s+/) : [];
    if (!scopes.includes(requiredScope)) {
      send(res, 403, { error: "insufficient_scope" }, {
        "www-authenticate": `Bearer error="insufficient_scope", scope="${requiredScope}"`,
      });
      return undefined;
    }
    return { audience: config.ordersAudience, scope: requiredScope, actor: actorOf(payload), subject: payload.sub ?? "" };
  }

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (method === "GET" && parts.length === 1 && parts[0] === "orders") {
      const verified = await verify(req, res, READ_ORDERS);
      if (!verified) return;
      send(res, 200, {
        orders: data.orders(verified.subject),
        verified,
      });
      return;
    }

    if (method === "POST" && parts.length === 3 && parts[0] === "orders" && parts[2] === "cancel") {
      const verified = await verify(req, res, WRITE_ORDERS);
      if (!verified) return;
      const id = decodeURIComponent(parts[1] ?? "");
      const result = data.cancel(verified.subject, id);
      if (result === "not_found") return send(res, 404, { error: "not_found" });
      if (result === "shipped") return send(res, 409, { error: "already_shipped" });
      send(res, 200, { order_id: id, result, verified });
      return;
    }

    send(res, 404, { error: "not_found" });
  };
}

export function createOrdersServer(config: OrdersApiConfig, keys?: JWTVerifyGetKey): Server {
  const listener = createOrdersListener(config, keys);
  return createServer((req, res) => {
    listener(req, res).catch(() => send(res, 500, { error: "server_error" }));
  });
}
