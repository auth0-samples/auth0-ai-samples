"use client";

import { useUser } from "@auth0/nextjs-auth0";

export default function Page() {
  // Extract the user object and loading state from Auth0.
  const { user, isLoading } = useUser();

  if (isLoading) return <div>Loading...</div>;

  // If no user, show sign-up and login buttons.
  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center h-screen p-10">
        <a href="/auth/login?screen_hint=signup">
          <button>Sign up</button>
        </a>
        <a href="/auth/login">
          <button>Log in</button>
        </a>
      </main>
    );
  }

  // If user exists, show a welcome message and logout button.
  return (
    <main className="flex flex-col items-center justify-center h-screen p-10">
      <h1>Welcome, {user.name}!</h1>
      <p>
        <a href="/auth/logout">
          <button>Log out</button>
        </a>
      </p>
    </main>
  );
}
