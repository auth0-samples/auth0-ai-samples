'use client';

import { useStream } from "@langchain/langgraph-sdk/react";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { TokenVaultConsentPopup } from "@/components/auth0-ai/TokenVault/popup";
import { useQueryState } from "nuqs";
import { FormEventHandler, useEffect, useRef, useState } from "react";

const useFocus = () => {
  const htmlElRef = useRef<HTMLInputElement>(null);
  const setFocus = () => {
    if (!htmlElRef.current) {
      return;
    }
    htmlElRef.current.focus();
  };
  return [htmlElRef, setFocus] as const;
};

export default function Chat() {
  const [threadId, setThreadId] = useQueryState("threadId");
  const [input, setInput] = useState("");
  const thread = useStream({
    apiUrl: `${process.env.NEXT_PUBLIC_URL}/api/chat`,
    assistantId: "agent",
    threadId,
    onThreadId: setThreadId,
    onError: (err) => {
      console.dir(err);
    },
  });

  const [inputRef, setInputFocus] = useFocus();
  useEffect(() => {
    if (thread.isLoading) {
      return;
    }
    setInputFocus();
  }, [thread.isLoading, setInputFocus]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    thread.submit(
      { messages: [{ type: "human", content: input }] },
      {
        optimisticValues: (prev) => ({
          messages: [
            ...((prev?.messages as []) ?? []),
            { type: "human", content: input, id: "temp" },
          ],
        }),
      }
    );
    setInput("");
  };

  return (
    <div>
      {thread.messages.filter((m) => m.content && ["human", "ai"].includes(m.type)).map((message) => (
        <div key={message.id}>
          {message.type === "human" ? "User: " : "AI: "}
          {message.content as string}
        </div>
      ))}

      {thread.interrupt && TokenVaultInterrupt.isInterrupt(thread.interrupt.value) ? (
        <div key={thread.interrupt.ns?.join("")}>
          <TokenVaultConsentPopup
            interrupt={thread.interrupt.value}
            onFinish={() => thread.submit(null)}
            connectWidget={{
                title: "Check your availability in Google Calendar",
                description:"description ...",
                action: { label: "Check" },
              }}
          />
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <input ref={inputRef} value={input} placeholder="Say something..." readOnly={thread.isLoading} disabled={thread.isLoading} onChange={(e) => setInput(e.target.value)} />
      </form>
    </div>
  );
}