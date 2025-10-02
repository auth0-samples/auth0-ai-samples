import { createRemoteJWKSet, jwtVerify } from "jose";

import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

// JWKS endpoint for Auth0
const JWKS = createRemoteJWKSet(
  new URL(`https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`)
);

// Create the Auth instance
const auth = new Auth();
// Register the authentication handler
auth.authenticate(async (request: Request) => {
  const authHeader = request.headers.get("Authorization");
  const xApiKeyHeader = request.headers.get("x-api-key");
    /**
     * LangGraph Platform will convert the `Authorization` header from the client to an `x-api-key` header automatically
     * as of now: https://docs.langchain.com/langgraph-platform/custom-auth
     *
     * We can still leverage the `Authorization` header when served in other infrastructure w/ langgraph-cli
     * or when running locally.
     */
    // This header is required in Langgraph Cloud.
    if (!authHeader && !xApiKeyHeader) {
      throw new HTTPException(401, {
        message: "Invalid auth header provided.",
      });
    }

    // prefer the xApiKeyHeader first
    let token = xApiKeyHeader || authHeader;

    // Remove "Bearer " prefix if present
    if (token && token.startsWith("Bearer ")) {
      token = token.substring(7);
    }

    // Validate Auth0 Access Token using common JWKS endpoint
    if (!token) {
      throw new HTTPException(401, {
        message:
          "Authorization header format must be of the form: Bearer <token>",
      });
    }

    if (token) {
      try {
        // Verify the JWT using Auth0 JWKS
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: `https://${AUTH0_DOMAIN}/`,
          audience: AUTH0_AUDIENCE,
        });

        console.log("✅ Auth0 JWT payload resolved!", payload);

        // Return the verified payload - this becomes available in graph nodes
        return {
          identity: payload.sub!,
          email: payload.email as string,
          permissions:
            typeof payload.scope === "string" ? payload.scope.split(" ") : [],
          auth_type: "auth0",
          // include the access token for use with Auth0 Token Vault exchanges by tools
          getRawAccessToken: () => token,
          // Add any other claims you need
          ...payload,
        };
      } catch (jwtError) {
        
      }
    }
});

export { auth };