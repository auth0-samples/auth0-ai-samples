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
        const client = await initAuth0();

        // Check if user is returning from login redirect or connect flow
        if (
          (window.location.search.includes("code=") ||
            window.location.search.includes("connect_code=")) &&
          window.location.search.includes("state=")
        ) {
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

  const handleLogin = async (targetUrl?: string) => {
    try {
      setError(null);
      await login(targetUrl);
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleLogout = async () => {
    try {
      setError(null);
      await logout();
      setIsAuthenticatedState(false);
      setUser(null);
    } catch (err) {
      console.error("Logout error:", err);
      setError(err instanceof Error ? err.message : "Logout failed");
    }
  };

  const contextValue: Auth0ContextType = {
    isLoading,
    isAuthenticated: isAuthenticatedState,
    user,
    error,
    login: handleLogin,
    logout: handleLogout,
    getToken,
  };

  return (
    <Auth0Context.Provider value={contextValue}>
      {children}
    </Auth0Context.Provider>
  );
};
