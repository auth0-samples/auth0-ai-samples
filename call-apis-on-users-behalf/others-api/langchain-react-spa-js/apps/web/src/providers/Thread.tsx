import { useQueryState } from "nuqs";
import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { validate } from "uuid";

import { useAuth0 } from "@/hooks/useAuth0";
import { Thread } from "@langchain/langgraph-sdk";

import { createClient } from "./client";

interface ThreadContextType {
  getThreads: () => Promise<Thread[]>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoading: boolean;
  setThreadsLoading: Dispatch<SetStateAction<boolean>>;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

function getThreadSearchMetadata(
  assistantId: string,
): { graph_id: string } | { assistant_id: string } {
  if (validate(assistantId)) {
    return { assistant_id: assistantId };
  } else {
    return { graph_id: assistantId };
  }
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  // Get environment variables
  const envApiUrl: string | undefined = import.meta.env.VITE_LANGGRAPH_API_URL;
  const envAssistantId: string | undefined = import.meta.env.VITE_ASSISTANT_ID;

  // Use URL params with env var fallbacks
  const [apiUrlParam] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantIdParam] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });

  // Determine final values to use, prioritizing URL params then env vars
  const apiUrl = apiUrlParam || envApiUrl || "http://localhost:2024";
  const assistantId = assistantIdParam || envAssistantId || "memory_agent";

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
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

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    if (!apiUrl || !assistantId || !accessToken) {
      return [];
    }

    try {
      const client = createClient(apiUrl, accessToken);
      const searchMetadata = getThreadSearchMetadata(assistantId);

      const threads = await client.threads.search({
        metadata: searchMetadata,
        limit: 100,
      });

      // If no threads found with metadata search, try getting all threads
      if (threads.length === 0) {
        const allThreads = await client.threads.search({
          limit: 100,
        });

        return allThreads;
      }

      return threads;
    } catch (error) {
      console.error("ThreadProvider: Error fetching threads:", error);
      return [];
    }
  }, [apiUrl, assistantId, accessToken]);

  const value = {
    getThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }
  return context;
}
