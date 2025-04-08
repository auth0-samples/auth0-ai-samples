"use client";

import React from "react";
import { useChat } from "@ai-sdk/react";

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({});
  return (
    <main className="flex flex-col items-center justify-center h-screen p-10">
      <div className="flex flex-col gap-2">
        {messages.map((message) => (
          <div key={message.id}>
            {message.role === "user" ? "User: " : "AI: "}
            {message.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          name="prompt"
          value={input}
          className="w-full border"
          onChange={handleInputChange}
        />
        <button
          className="border-zinc-800 bg-zinc-800 border-2 rounded-md p-2 m-2 text-zinc-50 hover:bg-black"
          type="submit"
        >
          Send
        </button>
      </form>
    </main>
  );
}
