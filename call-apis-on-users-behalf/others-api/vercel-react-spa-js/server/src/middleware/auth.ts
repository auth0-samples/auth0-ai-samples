import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Auth0 configuration
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
  throw new Error(
    "Missing AUTH0_DOMAIN or AUTH0_AUDIENCE environment variables"
  );
}

// JWKS endpoint for Auth0
const JWKS = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
);

export interface JwtPayload {
  sub: string;
  aud: string[];
  iss: string;
  exp: number;
  iat: number;
  azp: string;
  scope?: string;
  [key: string]: any;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: {
      token: string;
      jwtPayload: JwtPayload;
    };
  }
}

export const jwtAuthMiddleware = () => {
  return async (c: Context, next: Next) => {
    try {
      const authHeader = c.req.header("authorization");

      if (!authHeader) {
        return c.json({ error: "Authorization header missing" }, 401);
      }

      const token = authHeader.replace("Bearer ", "");

      if (!token) {
        return c.json({ error: "Token missing" }, 401);
      }

      // Verify the JWT
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://${AUTH0_DOMAIN}/`,
        audience: AUTH0_AUDIENCE,
      });

      // Store access token in context
      c.set("auth", { token, jwtPayload: payload as JwtPayload });

      await next();
    } catch (error) {
      console.error("JWT verification failed:", error);
      return c.json({ error: "Invalid token" }, 401);
    }
  };
};
