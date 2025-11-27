import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { useChat } from "@ai-sdk/react";
import { useInterruptions } from "@auth0/ai-vercel/react";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";

import { useAuth0 } from "../hooks/useAuth0";
import { TokenVaultConsentPopup } from "./TokenVaultConsentPopup";
import { MarkdownText } from "./MarkdownText";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

import type { TextUIPart, UIMessage } from "ai";
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

export function Chat() {
  const { getToken } = useAuth0();
  const [input, setInput] = useState<string>("");
  const chatHelpers = useInterruptions((errorHandler) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useChat({
      transport: new DefaultChatTransport({
        api: `${SERVER_URL}/chat`,
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
          const token = await getToken();
          return fetch(url, {
            ...init,
            headers: {
              "Content-Type": "application/json",
              ...init?.headers,
              Authorization: `Bearer ${token}`,
            },
          });
        }) as typeof fetch,
      }),
      onError: errorHandler((error) => {
        console.error("Chat error:", error);
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    })
  );

  const { messages, sendMessage, status, error, setMessages, toolInterrupt } =
    chatHelpers;

  const clearMessages = () => {
    // Use setMessages to properly clear the chat history
    setMessages([]);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">
          Calendar Assistant
        </CardTitle>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearMessages}
            className="h-8 w-8 p-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages */}
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Ask me about your calendar events!</p>
              <p className="text-xs mt-1">
                Try: "What meetings do I have today?" or "Show me my upcoming
                events"
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
          {status === "streaming" && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 max-w-[80%] flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Thinking...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error message - hide if it's an Auth0 interrupt (we show the popup instead) */}
        {error && !TokenVaultInterrupt.isInterrupt(toolInterrupt) && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            Error: {error.message}
          </div>
        )}

        {/* Step-Up Auth Interrupt Handling */}
        {TokenVaultInterrupt.isInterrupt(toolInterrupt) && (
          <TokenVaultConsentPopup interrupt={toolInterrupt} />
        )}

        {/* Input form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage({ text: input });
            setInput("");
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your calendar..."
            disabled={status === "streaming"}
            className="flex-1"
          />
          <Button
            className="h-10"
            type="submit"
            disabled={status === "streaming" || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  // Get all text content from the message parts
  const textContent = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as TextUIPart).text)
    .join("");

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-lg px-3 py-2 max-w-[80%] ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{textContent}</p>
        ) : (
          <div className="text-sm">
            <MarkdownText>{textContent}</MarkdownText>
          </div>
        )}
      </div>
    </div>
  );
}
