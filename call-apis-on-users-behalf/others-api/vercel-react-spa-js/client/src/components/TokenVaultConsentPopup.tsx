import { useCallback, useState } from "react";

import { getAuth0Client } from "../lib/auth0";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/**
 * Component for handling connection authorization popups.
 * This component manages the authorization flow for token exchange with Token Vault,
 * allowing the application to exchange access tokens for third-party API tokens.
 */

import type { Auth0InterruptionUI } from "@auth0/ai-vercel/react";

interface TokenVaultConsentPopupProps {
  interrupt: Auth0InterruptionUI;
}

export function TokenVaultConsentPopup({
  interrupt,
}: TokenVaultConsentPopupProps) {
  const [isLoading, setIsLoading] = useState(false);

  const { connection, requiredScopes, authorizationParams, resume } = interrupt;

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
        authorization_params: {
          scope: validScopes.join(" "), // provider-specific scopes
          ...authorizationParams,
        },
      });

      setIsLoading(false);

      // Resume the interrupted tool after successful authorization
      if (typeof resume === "function") {
        resume();
      }
    } catch (error) {
      console.error("Federated login failed:", error);
      setIsLoading(false);

      // Even if login fails, we should clear the interrupt
      if (typeof resume === "function") {
        resume();
      }
    }
  }, [connection, requiredScopes, authorizationParams, resume]);

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
          To access your {connection.replace("-", " ")} data, you need to
          connect your account and authorize this application.
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
