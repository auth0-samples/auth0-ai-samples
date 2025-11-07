import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuth0Client } from "@/lib/auth0";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";

/**
 * Component for handling Token Vault authorization in LangGraph SDK.
 * This handles Auth0 Token Vault interrupts by prompting the user
 * to authorize additional scopes via popup authentication.
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

  const { connection, requiredScopes, message } = interrupt;

  // Use Auth0 SPA SDK to request additional connection/scopes
  const startFederatedLogin = useCallback(async () => {
    try {
      setIsLoading(true);

      // Filter out empty scopes
      const validScopes = requiredScopes.filter(
        (scope: string) => scope && scope.trim() !== "",
      );

      // Get the Auth0 client and use getTokenWithPopup for step-up authorization
      const auth0Client = getAuth0Client();

      // Use getTokenWithPopup for step-up authorization to request additional scopes
      await auth0Client.getTokenWithPopup({
        //FIXME!!!
        authorizationParams: {
          prompt: "consent", // Required for token vault scopes
          connection: connection, // e.g., "google-oauth2"
          connection_scope: validScopes.join(" "), // Connection-specific scopes
          access_type: "offline",
        },
      });

      // IMPORTANT: After getting new scopes via popup, we need to ensure
      // subsequent API calls use the updated token. The Auth0 client should automatically
      // use the new token, but we should trigger a refresh to ensure the latest token is cached.
      await auth0Client.getTokenSilently();

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
  }, [connection, requiredScopes, onResume]);

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
        <Button onClick={startFederatedLogin} className="w-full">
          Authorize {connection.replace("-", " ")}
        </Button>
      </CardContent>
    </Card>
  );
}
