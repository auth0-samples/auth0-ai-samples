/**
 * Reads the settings of the example from environment variables. Nothing is hard-coded.
 *
 * The Auth0 settings of the MCP server (`AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID` and
 * `AUTH0_CLIENT_SECRET`) are not read here: `createFastMcpAuth` reads them from the environment
 * itself, see `auth.ts`.
 */

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? "").split(/\s+/).filter((entry) => entry.length > 0);
}

function port(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Environment variable ${name} must be a port number.`);
  }
  return parsed;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }
  return parsed;
}

/**
 * The port to listen on: `MCP_PORT` when set, else the port in `AUTH0_AUDIENCE` (the public URL
 * of this server), else 3001. Reading it from the audience keeps one value for the URL and the
 * port. Set `MCP_PORT` only when a proxy makes the public port differ from the listening port.
 */
function listenPort(env: NodeJS.ProcessEnv): number {
  if (env["MCP_PORT"]?.trim()) return port(env, "MCP_PORT", 3001);
  try {
    const fromAudience = new URL(env["AUTH0_AUDIENCE"] ?? "").port;
    if (fromAudience !== "") return Number(fromAudience);
  } catch {
    // The audience is read and checked by createFastMcpAuth.
  }
  return 3001;
}

export interface AppConfig {
  /** Scopes every request to the MCP server must carry. Empty means none. */
  requiredScopes: string[];
  /** Identifier (audience) of the orders API. */
  ordersAudience: string;
  /** Base URL of the orders API process the tools call. */
  ordersApiUrl: string;
  /** Longest wait for the orders API, in milliseconds. */
  downstreamTimeoutMs: number;
  port: number;
}

export interface OrdersApiConfig {
  domain: string;
  ordersAudience: string;
  port: number;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    requiredScopes: list(env["MCP_REQUIRED_SCOPES"]),
    ordersAudience: required(env, "ORDERS_AUDIENCE"),
    ordersApiUrl: required(env, "ORDERS_API_URL"),
    downstreamTimeoutMs: positiveInt(env, "DOWNSTREAM_TIMEOUT_MS", 5000),
    port: listenPort(env),
  };
}

export function loadOrdersApiConfig(env: NodeJS.ProcessEnv = process.env): OrdersApiConfig {
  return {
    domain: required(env, "AUTH0_DOMAIN"),
    ordersAudience: required(env, "ORDERS_AUDIENCE"),
    port: port(env, "ORDERS_API_PORT", 3004),
  };
}
