import { useState } from "react";

import { useAuth0 } from "./useAuth0";

import type { UIMessage } from "ai";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

export function useChat() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { getToken } = useAuth0();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const currentInput = input;
    setInput("");
    setIsLoading(true);
    setError(null);

    // Add user message
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: currentInput }],
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const token = await getToken();
      const response = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: currentInput }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Add assistant message placeholder
      const assistantMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: "" }],
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Handle the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      let assistantContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith("0:")) {
            try {
              // The content after "0:" is either a JSON string or plain text
              const content = line.slice(2);

              // Try to parse as JSON first (for structured data)
              try {
                const parsed = JSON.parse(content);
                if (typeof parsed === "string") {
                  assistantContent += parsed;
                } else if (parsed.textDelta) {
                  assistantContent += parsed.textDelta;
                }
              } catch {
                // If not JSON, treat as plain text (this handles the streaming text chunks)
                const textContent = JSON.parse(content); // This will parse the quoted string
                assistantContent += textContent;
              }

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessage.id
                    ? { ...msg, parts: [{ type: "text", text: assistantContent }] }
                    : msg
                )
              );
            } catch {
              // Ignore parsing errors for malformed lines
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("An error occurred"));
      console.error("Chat error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    setError(null);
  };

  const reload = () => {
    // Implement reload if needed
  };

  const stop = () => {
    // Implement stop if needed
  };

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    reload,
    stop,
    clearMessages,
  };
}
