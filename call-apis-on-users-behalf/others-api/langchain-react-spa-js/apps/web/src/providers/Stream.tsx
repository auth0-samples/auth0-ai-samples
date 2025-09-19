import { ArrowRight } from "lucide-react";
import { useQueryState } from "nuqs";
import React, { ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth0 } from "@/hooks/useAuth0";
import { StreamContext, useTypedStream } from "@/hooks/useStreamContext";
import { uiMessageReducer } from "@langchain/langgraph-sdk/react-ui";

import { useThreads } from "./Thread";

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  accessToken: string | null,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch(`${apiUrl}/info`, {
      headers,
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiUrl,
  assistantId,
}: {
  children: ReactNode;
  apiUrl: string;
  assistantId: string;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();
  const { getToken, isAuthenticated } = useAuth0();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Get access token when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      getToken().then(setAccessToken).catch(console.error);
    } else {
      setAccessToken(null);
    }
  }, [isAuthenticated, getToken]);

  // Don't render the stream until we have an access token
  if (isAuthenticated && !accessToken) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <StreamSessionInner
      apiUrl={apiUrl}
      assistantId={assistantId}
      accessToken={accessToken}
      threadId={threadId}
      setThreadId={setThreadId}
      getThreads={getThreads}
      setThreads={setThreads}
    >
      {children}
    </StreamSessionInner>
  );
};

const StreamSessionInner = ({
  children,
  apiUrl,
  assistantId,
  accessToken,
  threadId,
  setThreadId,
  getThreads,
  setThreads,
}: {
  children: ReactNode;
  apiUrl: string;
  assistantId: string;
  accessToken: string | null;
  threadId: string | null;
  setThreadId: (id: string) => void;
  getThreads: () => Promise<any>;
  setThreads: (threads: any) => void;
}) => {
  // Only initialize the stream when we have an access token (or when user is not authenticated)
  const streamValue = useTypedStream({
    apiUrl,
    assistantId,
    threadId: threadId ?? null,
    defaultHeaders: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : undefined,
    onCustomEvent: (event: any, options: any) => {
      options.mutate((prev: any) => {
        const ui = uiMessageReducer(prev.ui ?? [], event);
        return { ...prev, ui };
      });
    },
    onThreadId: (id: string) => {
      setThreadId(id);
      // Refetch threads list when thread ID changes.
      // Wait for some seconds before fetching so we're able to get the new thread that was created.
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
  });

  useEffect(() => {
    if (accessToken) {
      checkGraphStatus(apiUrl, accessToken).then((ok) => {
        if (!ok) {
          toast.error("Failed to connect to LangGraph server", {
            description: () => (
              <p>
                Please ensure your graph is running at <code>{apiUrl}</code> and
                you are properly authenticated.
              </p>
            ),
            duration: 10000,
            richColors: true,
            closeButton: true,
          });
        }
      });
    }
  }, [accessToken, apiUrl]);

  return (
    <StreamContext.Provider value={streamValue}>
      {children}
    </StreamContext.Provider>
  );
};

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = "memory_agent";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated } = useAuth0();

  // Get environment variables
  const envApiUrl: string | undefined = import.meta.env.VITE_LANGGRAPH_API_URL;
  const envAssistantId: string | undefined = import.meta.env.VITE_ASSISTANT_ID;

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });

  // Determine final values to use, prioritizing URL params then env vars
  const finalApiUrl = apiUrl || envApiUrl || DEFAULT_API_URL;
  const finalAssistantId =
    assistantId || envAssistantId || DEFAULT_ASSISTANT_ID;

  // If not authenticated, just render children (App.tsx will handle auth flow)
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Show the form if no URL params are set AND user is authenticated
  // This ensures auth happens first, then configuration
  if (!apiUrl || !assistantId) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full p-4">
        <div className="animate-in fade-in-0 zoom-in-95 flex flex-col border bg-background shadow-lg rounded-lg max-w-3xl">
          <div className="flex flex-col gap-2 mt-14 p-6 border-b">
            <div className="flex items-start flex-col gap-2">
              <LangGraphLogoSVG className="h-7" />
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground">
              Welcome to Agent Chat! Before you get started, you need to enter
              the URL of the deployment and the assistant / graph ID.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;

              setApiUrl(apiUrl);
              setAssistantId(assistantId);

              form.reset();
            }}
            className="flex flex-col gap-6 p-6 bg-muted/50"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={finalApiUrl}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assistantId">
                Assistant / Graph ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the ID of the graph (can be the graph name), or
                assistant to fetch threads from, and invoke when actions are
                taken.
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={finalAssistantId}
                required
              />
            </div>

            <div className="flex justify-end mt-2">
              <Button type="submit" size="lg">
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <StreamSession apiUrl={finalApiUrl} assistantId={finalAssistantId}>
      {children}
    </StreamSession>
  );
};
