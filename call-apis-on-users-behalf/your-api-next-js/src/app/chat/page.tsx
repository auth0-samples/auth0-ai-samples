"use client";

import React from "react";
import { useChat } from "@ai-sdk/react";

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({});
  return (
    <>
      <div className="flex flex-col gap-2">
        {messages.map((message) => (
          <div key={message.id}>
            {message.role === "user" ? "User: " : "AI: "}
            {message.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 border">
        <input
          name="prompt"
          value={input}
          className="w-full"
          onChange={handleInputChange}
        />
        <button type="submit">Send</button>
      </form>
    </>
  );
}
