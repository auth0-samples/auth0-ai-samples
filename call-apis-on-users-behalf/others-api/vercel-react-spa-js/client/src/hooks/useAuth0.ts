import { useContext } from "react";

import { Auth0Context, Auth0ContextType } from "../contexts/auth0-context";

export const useAuth0 = (): Auth0ContextType => {
  const context = useContext(Auth0Context);
  if (!context) {
    throw new Error("useAuth0 must be used within an Auth0Provider");
  }
  return context;
};
