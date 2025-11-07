import { Auth0Client, createAuth0Client } from "@auth0/auth0-spa-js";

// Auth0 configuration
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE;

if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
  throw new Error(
    "Missing Auth0 configuration. Please check your environment variables."
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
      scope: "openid profile email offline_access",
    },
    // Store tokens in localstorage to allow restoring the user session after following redirects.
    // Redirects are necessary to connect an account for the user.
    cacheLocation: 'localstorage',
    useRefreshTokens: true,
    useMrrt: true,
    useDpop: true,
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

  const options = {
    appState: targetUrl ? { targetUrl } : undefined,
  };

  await client.loginWithRedirect(options);
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

export const getUser = async () => {
  const client = getAuth0Client();
  return await client.getUser();
};
