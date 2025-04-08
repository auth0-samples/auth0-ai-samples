"use client";

import { useUser } from "@auth0/nextjs-auth0";
import { useCompletion } from "@ai-sdk/react";

export default function Page() {
  // Extract the user object and loading state from Auth0.
  const { user, isLoading } = useUser();
  // Use streaming response from the Next.js route.
  const { completion, input, handleInputChange, handleSubmit } = useCompletion({
    api: "/api/chat",
  });

  if (isLoading) return <div>Loading...</div>;

  // If no user, show sign-up and login buttons.
  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center h-screen p-10">
        <a href="/auth/login?screen_hint=signup&connection=google-oauth2&access_type=offline&prompt=consent">
          <button>Sign up with Google</button>
        </a>
        <a href="/auth/login?connection=google-oauth2&access_type=offline&prompt=consent">
          <button>Log in with Google</button>
        </a>
      </main>
    );
  }

  // If user exists, show a welcome message and logout button.
  return (
    <main className="flex flex-col items-center justify-center h-screen p-10">
      <h1>Welcome, {user.name}!</h1>
      {/* Main form for interacting with the AI. */}
      <form onSubmit={handleSubmit}>
        <input
          name="prompt"
          value={input}
          onChange={handleInputChange}
          id="input"
          className="border-zinc-800 border-2 rounded-md p-2 m-2"
        />
        <button
          type="submit"
          className="border-zinc-800 bg-zinc-800 border-2 rounded-md p-2 m-2 text-zinc-50 hover:bg-black"
        >
          Submit
        </button>
        <div>{completion}</div>
      </form>
    </main>
  );
}
