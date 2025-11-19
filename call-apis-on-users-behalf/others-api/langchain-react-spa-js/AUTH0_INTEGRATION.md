# Auth0 Integration Guide for LangGraph create-agent-chat-app

This guide provides detailed documentation on how to integrate Auth0 authentication with the LangGraph create-agent-chat-app template. The create-agent-chat-app template is a React Single Page Application (SPA) that provides a chat interface for interacting with LangGraph agents while leveraging Auth0 for user authentication and Auth0's Token Vault for secure API access.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
   - [Frontend (React SPA with Vite)](#frontend-react-spa-with-vite)
   - [Backend (LangGraph API with Custom Authentication)](#backend-langgraph-api-with-custom-authentication)
2. [Communication Flow](#communication-flow)
3. [Prerequisites and Setup](#prerequisites-and-setup)
   - [Auth0 Configuration Requirements](#auth0-configuration-requirements)
   - [Environment Configuration](#environment-configuration)
4. [Implementation Steps](#implementation-steps)
   - [Frontend React SPA with Vite Auth0 Implementation](#frontend-react-spa-with-vite-auth0-implementation)
     - [Install Required Dependencies](#install-required-dependencies)
     - [Auth0 Client Configuration](#auth0-client-configuration)
     - [React Context Provider Setup](#react-context-provider-setup)
     - [Wrap Application with Provider](#wrap-application-with-provider)
     - [Client-Side Integration](#client-side-integration)
     - [Step Up Authorization with Auth0 Interrupts](#step-up-authorization-with-auth0-interrupts)
   - [Backend LangGraph API Implementation](#backend-langgraph-api-implementation)
     - [LangGraph Custom Authentication](#langgraph-custom-authentication)
     - [Token Vault Integration](#token-vault-integration)
5. [Security Considerations](#security-considerations)
   - [Token Management](#token-management)
   - [API Protection](#api-protection)
   - [Best Practices Implemented](#best-practices-implemented)
6. [Troubleshooting Guide](#troubleshooting-guide)
   - [Common Issues and Solutions](#common-issues-and-solutions)
   - [Debug Mode](#debug-mode)
7. [Migration from Direct API Access](#migration-from-direct-api-access)
8. [Performance Considerations](#performance-considerations)
9. [Conclusion](#conclusion)

## Architecture Overview

The integration follows a React SPA + LangGraph API architecture pattern:

### Frontend (React SPA with Vite)
- Uses `@auth0/auth0-spa-js` for authentication
- Implements Auth0's Universal Login flow for SPAs
- Manages user sessions and JWT tokens in browser
- Sends authenticated API calls directly to LangGraph backend API
- Built with Vite for fast development and optimized production builds

### Backend (LangGraph API with Custom Authentication)
The create-agent-chat-app template includes a custom LangGraph authentication handler that:
- Validates Auth0 JWT tokens using JWKS verification
- Handles both local development (`Authorization` header) and LangGraph Platform deployment (`x-api-key` header)
- Provides user identity and permissions to LangGraph nodes
- Enables Auth0 Token Vault integration for accessing third-party APIs from the LangGraph API

## Communication Flow

The integration implements a direct SPA-to-API communication pattern where:

1. **Frontend Authentication**: Users authenticate with Auth0 through the React SPA
2. **Token Management**: Auth0 SPA SDK manages JWT tokens in memory and local storage
3. **API Protection**: LangGraph backend validates JWT tokens using custom authentication
4. **Direct Communication**: React app sends authenticated requests directly to LangGraph API
5. **Token Vault Integration**: Backend can exchange user tokens for third-party API access

This approach provides optimal performance for SPAs while maintaining security through JWT validation.

## Prerequisites and Setup

### Auth0 Configuration Requirements

Before implementation, configure these Auth0 resources:

1. **Application Registration**: Create a **Single Page Application** in Auth0
2. **API Registration**: Register an API to issue access tokens (this becomes your `AUTH0_AUDIENCE`)
3. **Callback URLs**: Configure allowed callback and logout URLs for your domain(s)
4. **Web Origins**: Configure allowed web origins for CORS

### Environment Configuration

For detailed environment variable setup, see the [README.md](README.md) which contains comprehensive environment configuration instructions for both the agents backend and web frontend.

## Implementation Steps

### Frontend React SPA with Vite Auth0 Implementation

#### Install Required Dependencies

The template includes the Auth0 SPA SDK:

```bash
npm install @auth0/auth0-spa-js
```

The `@auth0/auth0-spa-js` package provides:
- Client-side authentication for SPAs
- JWT token management in memory and local storage
- Silent token renewal
- Universal Login integration
- Support for the Connect Account flow

#### Auth0 Client Configuration

Create `apps/web/src/lib/auth0.ts` for Auth0 client setup:

```typescript
import { Auth0Client, createAuth0Client, User } from "@auth0/auth0-spa-js";

// Auth0 configuration
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE;

if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
  throw new Error(
    "Missing Auth0 configuration. Please check your environment variables.",
  );
}

let auth0Client: Auth0Client | null = null;

export const initAuth0 = async (): Promise<Auth0Client> => {
  if (auth0Client) {
    return auth0Client;
  }

  auth0Client = await createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience: AUTH0_AUDIENCE,
      scope: "openid profile email", // Basic scopes
    },
  });

  return auth0Client;
};

export const getAuth0Client = (): Auth0Client => {
  if (!auth0Client) {
    throw new Error("Auth0 client not initialized. Call initAuth0() first.");
  }
  return auth0Client;
};

export const login = async (targetUrl?: string) => {
  const client = getAuth0Client();
  await client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin,
    },
    appState: targetUrl ? { targetUrl } : undefined,
  });
};

export const logout = async () => {
  const client = getAuth0Client();
  await client.logout({
    logoutParams: {
      returnTo: window.location.origin,
    },
  });
};

export const getToken = async (): Promise<string> => {
  const client = getAuth0Client();
  return await client.getTokenSilently();
};

export const isAuthenticated = async (): Promise<boolean> => {
  const client = getAuth0Client();
  return await client.isAuthenticated();
};

export const getUser = async (): Promise<User | undefined> => {
  const client = getAuth0Client();
  return await client.getUser();
};
```

#### React Context Provider Setup

Create `apps/web/src/providers/Auth0.tsx`:

```typescript
import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Auth0Context, Auth0ContextType } from "@/contexts/auth0-context";
import {
  getToken,
  getUser,
  initAuth0,
  isAuthenticated,
  login,
  logout,
} from "@/lib/auth0";
import { User } from "@auth0/auth0-spa-js";

interface Auth0ProviderProps {
  children: ReactNode;
}

export const Auth0Provider: React.FC<Auth0ProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticatedState, setIsAuthenticatedState] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (initRef.current) return;
    initRef.current = true;

    const initializeAuth0 = async () => {
      try {
        setIsLoading(true);
        await initAuth0();

        // Handle redirect callback
        if (
          window.location.search.includes("code=") &&
          window.location.search.includes("state=")
        ) {
          const client = await initAuth0();
          await client.handleRedirectCallback();
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        }

        const authenticated = await isAuthenticated();
        setIsAuthenticatedState(authenticated);

        if (authenticated) {
          const userData = await getUser();
          setUser(userData as User);
        }
      } catch (err) {
        console.error("Auth0 initialization error:", err);
        setError(err instanceof Error ? err.message : "Authentication error");
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth0();
  }, []);

  const contextValue: Auth0ContextType = {
    isLoading,
    isAuthenticated: isAuthenticatedState,
    user,
    error,
    login: async (targetUrl?: string) => {
      try {
        setError(null);
        await login(targetUrl);
      } catch (err) {
        console.error("Login error:", err);
        setError(err instanceof Error ? err.message : "Login failed");
      }
    },
    logout: async () => {
      try {
        setError(null);
        await logout();
        setIsAuthenticatedState(false);
        setUser(null);
      } catch (err) {
        console.error("Logout error:", err);
        setError(err instanceof Error ? err.message : "Logout failed");
      }
    },
    getToken,
  };

  return (
    <Auth0Context.Provider value={contextValue}>
      {children}
    </Auth0Context.Provider>
  );
};
```

#### Wrap Application with Provider

Modify `apps/web/src/main.tsx`:

```typescript
import "./index.css";
import { NuqsAdapter } from "nuqs/adapters/react-router/v6";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import App from "./App.tsx";
import { Auth0Provider } from "./providers/Auth0.tsx";
import { StreamProvider } from "./providers/Stream.tsx";
import { ThreadProvider } from "./providers/Thread.tsx";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <NuqsAdapter>
      <Auth0Provider>
        <ThreadProvider>
          <StreamProvider>
            <App />
          </StreamProvider>
        </ThreadProvider>
      </Auth0Provider>
      <Toaster />
    </NuqsAdapter>
  </BrowserRouter>,
);
```

#### Client-Side Integration

Use the Auth0 context with the LangGraph's streaming capabilities in your Chat components:

```typescript
import { useAuth0 } from "@/hooks/useAuth0";
import { useStream } from "@langchain/langgraph-sdk/react";

export default function ChatInterface() {
  const { user, isLoading, isAuthenticated, login, logout, getToken } = useAuth0();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const apiUrl = import.meta.env.VITE_LANGGRAPH_API_URL || "http://localhost:2024";

  // Get access token when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      getToken().then(setAccessToken).catch(console.error);
    }
  }, [isAuthenticated, getToken]);

  // Initialize LangGraph stream with Auth0 token
  const stream = useStream({
    apiUrl,
    assistantId: "memory_agent", 
    defaultHeaders: accessToken 
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });

  const sendMessage = (content: string) => {
    if (!isAuthenticated || !content.trim()) return;
    
    stream.submit({
      messages: [{ 
        type: "human", 
        content,
        // User context available in agent workflows
        metadata: { userId: user?.sub }
      }]
    });
  };

  if (isLoading) return <div>Loading...</div>;

  if (!isAuthenticated) {
    return (
      <div>
        <h1>Welcome to LangGraph Chat</h1>
        <button onClick={() => login()}>Login with Auth0</button>
      </div>
    );
  }

  return (
    <div>
      <header>
        <span>Welcome, {user?.name}</span>
        <button onClick={() => logout()}>Logout</button>
      </header>
      
      <div className="messages">
        {stream.messages?.map((msg, i) => (
          <div key={i}>{msg.content}</div>
        ))}
      </div>
      
      <form onSubmit={(e) => {
        e.preventDefault();
        const input = new FormData(e.target).get('message');
        sendMessage(input as string);
        e.target.reset();
      }}>
        <input name="message" placeholder="Type a message..." />
        <button type="submit" disabled={stream.isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

#### Step Up Authorization with Auth0 Interrupts

The create-agent-chat-app template includes sophisticated interrupt handling for step-up authorization scenarios, particularly when accessing third-party APIs through Auth0's Token Vault. This enables agents to request additional permissions dynamically during conversations.

##### Token Vault Interrupts

When an agent tool requires access to a third-party service (like Google Calendar) that the user hasn't previously authorized, LangGraph can raise a `TokenVaultInterrupt`. The frontend handles these interrupts by starting a connect account flow in a popup, which will allow the end-user to authorize access to their third-party account.

##### Implementation

###### 1. Interrupt Detection in Chat Interface

In your chat message rendering logic, check for Auth0 interrupts:

```typescript
// In your chat message component
{threadInterrupt && 
  Auth0Interrupt.isInterrupt(threadInterrupt.value) &&
  isLastMessage ? (
    <Auth0InterruptHandler
      interrupt={threadInterrupt.value}
      onResume={() => thread.submit(null)}
    />
  ) : null}
```

###### 2. Auth0 Interrupt Handler Component

Create `apps/web/src/components/auth0/Auth0InterruptHandler.tsx`:

```typescript
import { Auth0Interrupt } from "@auth0/ai/interrupts";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { TokenVaultConsentPopup } from "./TokenVaultConsentPopup";

interface Auth0InterruptHandlerProps {
  interrupt: Auth0Interrupt;
  onResume: () => void;
}

export function Auth0InterruptHandler({
  interrupt,
  onResume,
}: Auth0InterruptHandlerProps) {
  // Handle TokenVaultInterrupt
  if (TokenVaultInterrupt.isInterrupt(interrupt)) {
    return (
      <TokenVaultConsentPopup
        interrupt={interrupt as TokenVaultInterrupt}
        onResume={onResume}
      />
    );
  }

  return null;
}
```

###### 3. Token Vault Consent Popup

The `TokenVaultConsentPopup` component handles the Connect Account flow for third-party connections:

```typescript
// apps/web/src/components/auth0/TokenVaultConsentPopup.tsx
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuth0Client } from "@/lib/auth0";
import type { TokenVaultInterrupt } from "@auth0/ai/interrupts";

/**
 * Component for handling connection authorization popups.
 * This component manages the connect account flow for Token Vault, allowing the
 * user to authorize access to third-party providers.
 */

interface TokenVaultConsentPopupProps {
  interrupt: TokenVaultInterrupt;
  onResume?: () => void;
}

export function TokenVaultConsentPopup({
  interrupt,
  onResume,
}: TokenVaultConsentPopupProps) {
  const [isLoading, setIsLoading] = useState(false);

  const { connection, requiredScopes, message, authorizationParams } =
    interrupt;

  // Use Auth0 SPA SDK to connect a third-party account
  const startConnectAccountFlow = useCallback(async () => {
    try {
      setIsLoading(true);

      // Filter out empty scopes
      const validScopes = requiredScopes.filter(
        (scope: string) => scope && scope.trim() !== "",
      );

      const auth0Client = getAuth0Client();

      // Use the connect account flow to request authorization+consent for the 3rd party API.
      // This will redirect the browser away from the SPA, unfortunately losing the current
      // state of the conversation with the chatbot.
      await auth0Client.connectAccountWithRedirect({
        connection,
        scopes: validScopes,
        ...(authorizationParams
          ? { authorization_params: authorizationParams }
          : {}),
      });

      setIsLoading(false);

      // Resume the interrupted tool after successful authorization
      if (typeof onResume === "function") {
        onResume();
      }
    } catch (error) {
      console.error("Federated login failed:", error);
      setIsLoading(false);

      // Even if login fails, we should clear the interrupt
      if (typeof onResume === "function") {
        onResume();
      }
    }
  }, [connection, requiredScopes, authorizationParams, onResume]);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">
              Connecting to {connection.replace("-", " ")}...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-lg text-yellow-800">
          Authorization Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-yellow-700">
          {message ||
            `To access your ${connection.replace("-", " ")} data, you need to
          authorize this application.`}
        </p>
        <p className="text-xs text-yellow-600">
          Required permissions:{" "}
          {requiredScopes
            .filter((scope: string) => scope && scope.trim() !== "")
            .join(", ")}
        </p>
        <Button onClick={startConnectAccountFlow} className="w-full">
          Connect &amp; Authorize {connection.replace("-", " ")}
        </Button>
      </CardContent>
    </Card>
  );
}
```

##### How It Works

1. **Agent Tool Execution**: When a tool like `checkUsersCalendar` needs additional permissions, it throws a `TokenVaultError`
2. **LangGraph Interrupt**: LangGraph converts this into a `TokenVaultInterrupt` and pauses execution
3. **Frontend Detection**: The React app detects the interrupt and renders the `Auth0InterruptHandler`
4. **User Authorization**: User clicks to connect and authorize the connection in a popup window
5. **Resume Execution**: After authorization, the conversation resumes with the new permissions

##### Benefits of Step Up Authorization

- **Minimal Initial Permissions**: Start with basic authentication, request additional access only when needed
- **Improved User Experience**: Users aren't overwhelmed with permission requests upfront
- **Dynamic Authorization**: Agents can request new permissions based on conversation context
- **Secure Token Exchange**: Uses Auth0's Token Vault for secure third-party API access

### Backend LangGraph API Implementation

#### LangGraph Custom Authentication

LangGraph supports custom authentication to validate incoming tokens and extract user context. This enables user-specific authorization and auditing within your LangGraph applications.

##### Configuration

Configure your LangGraph deployment to accept Auth0 tokens by setting up custom authentication. See the [LangGraph Custom Auth documentation](https://docs.langchain.com/langgraph-platform/custom-auth) for detailed setup.

##### Example Custom Auth Handler

See the implementation from `apps/agents/src/auth.ts`:

```typescript
import { createRemoteJWKSet, jwtVerify } from "jose";
const { Auth, HTTPException } = require("@langchain/langgraph-sdk/auth");

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

// JWKS endpoint for Auth0
const JWKS = createRemoteJWKSet(
  new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
);

const auth = new Auth();

auth.authenticate(async (request: Request) => {
  const authHeader = request.headers.get("Authorization");
  const xApiKeyHeader = request.headers.get("x-api-key");
  
  // LangGraph Platform converts Authorization to x-api-key automatically
  let token = xApiKeyHeader ?? authHeader;
  
  if (token && token.startsWith("Bearer ")) {
    token = token.substring(7);
  }

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://${AUTH0_DOMAIN}/`,
    audience: AUTH0_AUDIENCE,
  });

  return {
    identity: payload.sub!,
    email: payload.email as string,
    permissions: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
    auth_type: "auth0",
    getRawAccessToken: () => token,
    ...payload,
  };
});

export { auth as authHandler };
```

Then you can reference the custom auth handler in your `langgraph.json` file:

```json
{
  "node_version": "20",
  "dependencies": ["."],
  "graphs": {
    "memory_agent": "./apps/agents/src/memory-agent/graph.ts:graph"
  },
  "auth": {
    "path": "./apps/agents/src/auth.ts:authHandler"
  },
  "http": {
    "configurable_headers": {
      "include": ["authorization", "x-api-key"]
    }
  },
  "env": "./apps/agents/.env"
}
```

#### Token Vault Integration

The actual Token Vault implementation from `apps/agents/src/auth0-ai.ts`:

```typescript
import { SUBJECT_TOKEN_TYPES } from "@auth0/ai";
import { Auth0AI } from "@auth0/ai-langchain";

const auth0AI = new Auth0AI({
  auth0: {
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CUSTOM_API_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CUSTOM_API_CLIENT_SECRET!,
  },
});

export const withGoogleCalendar = auth0AI.withTokenVault({
  connection: "google-oauth2",
  scopes: ["https://www.googleapis.com/auth/calendar.freebusy"],
  accessToken: async (_, config) => {
    return config.configurable?.langgraph_auth_user?.getRawAccessToken();
  },
  subjectTokenType: SUBJECT_TOKEN_TYPES.SUBJECT_TYPE_ACCESS_TOKEN,
});
```

Then reference the Auth0 Token Vault wrapper above in the tool's definition:

```typescript
import { addHours, formatISO } from "date-fns";
import { GaxiosError } from "gaxios";
import { google } from "googleapis";

import { getAccessTokenFromTokenVault } from "@auth0/ai-langchain";
import { TokenVaultError } from "@auth0/ai/interrupts";
import { tool } from "@langchain/core/tools";

import { withGoogleCalendar } from "../../auth0-ai";

export const checkUsersCalendar = withGoogleCalendar(
  tool(
    async ({ date }) => {
      try {
        const accessToken = getAccessTokenFromTokenVault();

        const calendar = google.calendar("v3");
        const auth = new google.auth.OAuth2();

        auth.setCredentials({
          access_token: accessToken,
        });

        const response = await calendar.freebusy.query({
          auth,
          requestBody: {
            timeMin: formatISO(date),
            timeMax: addHours(date, 1).toISOString(),
            timeZone: "UTC",
            items: [{ id: "primary" }],
          },
        });

        return {
          available: response.data?.calendars?.primary?.busy?.length === 0,
        };
      } catch (err) {
        if (err instanceof GaxiosError && err.status === 401) {
          throw new TokenVaultError(
            `Authorization required to access the Token Vault`
          );
        }
        throw err;
      }
    },
  )
);
``` 

##### Benefits

With custom authentication configured:

- **User Context**: Access user information within your agent workflows
- **Authorization**: Implement user-specific access controls
- **Audit Logging**: Track actions by authenticated users
- **Personalization**: Customize responses based on user data

## Security Considerations

### Token Management
- **In-Memory Storage**: Access tokens are stored in memory and optionally in secure browser storage
- **Automatic Refresh**: The SPA SDK handles token refresh transparently using refresh tokens
- **Scope Limitation**: Tokens are limited to the configured audience and scopes
- **Secure Communication**: All tokens are sent over HTTPS only

### API Protection
- **JWT Validation**: LangGraph backend validates each request using JWKS verification
- **Custom Authentication**: Request validation happens at the LangGraph layer
- **Token Extraction**: Supports both Authorization headers and x-api-key formats
- **User Context**: Authentication payload provides user identity to agent workflows

### Best Practices Implemented
1. No long-lived secrets in client-side code
2. JWT tokens with limited scope and expiration
3. HTTPS-only communication
4. Proper CORS configuration


## Troubleshooting Guide

### Common Issues and Solutions

1. **"No access token available" Error**
   - **Cause**: Auth0 audience not configured or user hasn't authorized API access
   - **Solution**: Verify `VITE_AUTH0_AUDIENCE` matches your registered API identifier

2. **Login Redirect Loop**
   - **Cause**: Callback URL mismatch between Auth0 config and application origin
   - **Solution**: Ensure callback URLs match your deployed domain in Auth0 dashboard

3. **CORS Errors on API Calls**
   - **Cause**: LangGraph API not configured for your frontend domain
   - **Solution**: Configure CORS on your LangGraph deployment to allow your frontend origin

4. **JWT Verification Failed**
   - **Cause**: Token audience/issuer mismatch or expired tokens
   - **Solution**: Verify token claims match LangGraph API expectations and check environment variables

### Debug Mode

Enable debug logging in your React app by checking the browser console for Auth0 SDK logs. You can also add custom logging in your auth handlers to trace token flow.

## Migration from Direct API Access

If migrating an existing LangGraph application:

1. **Identify Direct API Calls**: Search for direct `fetch()` calls to LangGraph endpoints
2. **Add Authentication Headers**: Update all calls to include `Authorization: Bearer ${token}` headers
3. **Remove API Keys**: Delete any LangGraph API keys from client-side code
4. **Add Authentication Flow**: Implement Auth0 login/logout functionality
5. **Implement Custom Auth**: Add JWT verification to your LangGraph deployment
6. **Test Thoroughly**: Verify all functionality works with the new authentication flow

## Performance Considerations

- **Token Caching**: The SPA SDK caches tokens in memory to minimize Auth0 API calls
- **Silent Token Renewal**: Automatic background token refresh prevents authentication interruptions
- **Direct API Communication**: No proxy layer reduces latency compared to server-side approaches
- **Connection Management**: Browser handles HTTP/2 connection pooling automatically
- **Error Handling**: Implement retry logic with exponential backoff for resilience

## Conclusion

This integration provides a robust, secure foundation for authenticated LangGraph applications using modern SPA architecture. The direct communication pattern between React frontend and LangGraph API offers optimal performance while maintaining security through JWT validation and Auth0's Token Vault for third-party integrations.

Key benefits of this approach:
- **Performance**: Direct client-to-API communication without proxy overhead
- **Security**: JWT token validation with proper scoping and expiration
- **Scalability**: Stateless authentication suitable for distributed deployments
- **User Experience**: Seamless authentication with silent token renewal
- **Integration**: Token Vault support for secure third-party API access
