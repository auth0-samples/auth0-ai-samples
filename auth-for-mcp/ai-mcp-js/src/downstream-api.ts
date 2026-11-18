import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import type { DownstreamConfig } from "./config.js";
import {
  READ_ANALYTICS,
  READ_INVENTORY,
  READ_ORDERS,
  WRITE_INVENTORY,
} from "./scopes.js";
import { createStoreData } from "./store-data.js";
import type { StoreData } from "./store-data.js";

/**
 * One process that plays three small services: Orders, Inventory and Analytics.
 * Each has its own audience and scope. Every request is verified before it
 * reaches any data: signature (from the tenant's JWKS), issuer, the audience of
 * the service being called, expiry, subject and scope.
 */

interface Verified {
  audience: string;
  scope: string;
  actor: string | null;
  subject: string;
  payload: JWTPayload;
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function bearerToken(req: IncomingMessage): string | undefined {
  const match = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/.exec(
    req.headers.authorization ?? "",
  );
  return match?.[1];
}

function actorOf(payload: JWTPayload): string | null {
  const act = payload["act"];
  if (act && typeof act === "object") {
    const sub = (act as { sub?: unknown }).sub;
    if (typeof sub === "string") return sub;
  }
  return null;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 16_384) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createDownstreamListener(
  config: DownstreamConfig,
  keys?: JWTVerifyGetKey,
  data: StoreData = createStoreData(),
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const issuer = `https://${config.domain}/`;
  const getKey =
    keys ?? createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

  /** Verifies the request's token for one service. Answers the error itself on failure. */
  async function verify(
    req: IncomingMessage,
    res: ServerResponse,
    audience: string,
    requiredScope: string,
    kind: "user" | "service",
  ): Promise<Verified | undefined> {
    const token = bearerToken(req);
    const invalid = () =>
      send(
        res,
        401,
        { error: "invalid_token" },
        {
          "www-authenticate":
            token === undefined ? "Bearer" : 'Bearer error="invalid_token"',
        },
      );
    if (token === undefined) {
      invalid();
      return undefined;
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, getKey, {
        issuer,
        audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "sub"],
      }));
    } catch {
      invalid();
      return undefined;
    }
    const subject = payload.sub ?? "";
    const actor = actorOf(payload);
    // A user token has a person as subject; a service token belongs to a client.
    const isServiceToken = subject.endsWith("@clients") && actor === null;
    if ((kind === "service") !== isServiceToken) {
      invalid();
      return undefined;
    }
    const scopes =
      typeof payload["scope"] === "string" ? payload["scope"].split(/\s+/) : [];
    if (!scopes.includes(requiredScope)) {
      send(
        res,
        403,
        { error: "insufficient_scope" },
        {
          "www-authenticate": `Bearer error="insufficient_scope", scope="${requiredScope}"`,
        },
      );
      return undefined;
    }
    return { audience, scope: requiredScope, actor, subject, payload };
  }

  const proof = (v: Verified) => ({
    audience: v.audience,
    scope: v.scope,
    actor: v.actor,
    subject: v.subject,
  });

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";
    const [service, id, action] = parts;

    if (service === "orders" && method === "GET" && parts.length <= 2) {
      const v = await verify(req, res, config.ordersAudience, READ_ORDERS, "user");
      if (!v) return;
      if (id === undefined) {
        send(res, 200, {
          orders: data.orders(v.subject),
          verified: proof(v),
        });
        return;
      }
      const order = data.order(v.subject, id);
      if (!order) return send(res, 404, { error: "not_found" });
      send(res, 200, {
        order,
        verified: proof(v),
      });
      return;
    }

    if (service === "inventory" && id !== undefined) {
      if (method === "GET" && parts.length === 2) {
        const v = await verify(req, res, config.inventoryAudience, READ_INVENTORY, "user");
        if (!v) return;
        const stock = data.stock(id);
        if (stock === undefined) return send(res, 404, { error: "not_found" });
        send(res, 200, { sku: id, stock, verified: proof(v) });
        return;
      }
      if (method === "POST" && action === "reserve" && parts.length === 3) {
        const v = await verify(req, res, config.inventoryAudience, WRITE_INVENTORY, "user");
        if (!v) return;
        let body: unknown;
        try {
          body = await readJson(req);
        } catch {
          return send(res, 400, { error: "invalid_request" });
        }
        const { qty, order_id: orderId } = (body ?? {}) as {
          qty?: unknown;
          order_id?: unknown;
        };
        if (
          typeof qty !== "number" ||
          !Number.isInteger(qty) ||
          qty < 1 ||
          typeof orderId !== "string"
        ) {
          return send(res, 400, { error: "invalid_request" });
        }
        if (!data.order(v.subject, orderId)) return send(res, 404, { error: "not_found" });
        const result = data.reserve(v.subject, id, qty, orderId);
        if (!result) return send(res, 404, { error: "not_found" });
        send(res, 200, {
          sku: id,
          already_reserved: result.alreadyReserved,
          stock_before: result.before,
          stock_after: result.after,
          verified: proof(v),
        });
        return;
      }
    }

    if (
      service === "analytics" &&
      id === "monthly-revenue" &&
      parts.length === 2 &&
      method === "GET"
    ) {
      const v = await verify(req, res, config.analyticsAudience, READ_ANALYTICS, "service");
      if (!v) return;
      send(res, 200, {
        revenue_usd: 142000,
        top_product: "Enterprise Suite",
        verified: proof(v),
      });
      return;
    }

    send(res, 404, { error: "not_found" });
  };
}

export function createDownstreamServer(
  config: DownstreamConfig,
  keys?: JWTVerifyGetKey,
): Server {
  const listener = createDownstreamListener(config, keys);
  return createServer((req, res) => {
    listener(req, res).catch(() => send(res, 500, { error: "server_error" }));
  });
}
