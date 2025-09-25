import { useState } from "react";

import { hcWithType } from "@auth0/auth0-ai-js-examples-react-hono-ai-sdk-server/dist/client";

import { Avatar } from "./components/Avatar";
import { Chat } from "./components/Chat";
import { Button } from "./components/ui/button";
import { useAuth0 } from "./hooks/useAuth0";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

const client = hcWithType(SERVER_URL);

type ResponseType = Awaited<ReturnType<typeof client.hello.$get>>;

function App() {
  const [data, setData] = useState<
    Awaited<ReturnType<ResponseType["json"]>> | undefined
  >();
  const { isLoading, isAuthenticated, user, login, logout, getToken } =
    useAuth0();

  async function sendRequest() {
    try {
      const res = await client.hello.$get();
      if (!res.ok) {
        console.log("Error fetching data");
        return;
      }
      const data = await res.json();
      setData(data);
    } catch (error) {
      console.log(error);
    }
  }

  async function sendProtectedRequest() {
    try {
      if (!isAuthenticated) {
        console.log("User not authenticated");
        return;
      }

      const token = await getToken();
      const res = await client.api.external.$get(
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        console.log("Error fetching protected data");
        return;
      }
      const data = await res.json();
      setData(data);
    } catch (error) {
      console.log(error);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-6 items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6 items-center justify-center min-h-screen">
      <div className="flex items-center justify-center gap-8 mb-4">
        <a href="https://hono.dev" target="_blank" rel="noopener noreferrer">
          <img
            src="https://raw.githubusercontent.com/honojs/hono/main/docs/images/hono-logo.png"
            className="w-16 h-20 cursor-pointer object-contain"
            alt="Hono logo"
          />
        </a>
        <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg"
            className="w-16 h-16 cursor-pointer"
            alt="React logo"
          />
        </a>
        <a
          href="https://sdk.vercel.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://sdk.vercel.ai/icons/vercel.svg"
            className="w-16 h-16 cursor-pointer"
            alt="Vercel AI SDK logo"
          />
        </a>
        <a href="https://auth0.com" target="_blank" rel="noopener noreferrer">
          <img
            src="https://avatars.githubusercontent.com/u/2824157?s=200&v=4"
            className="w-16 h-16 cursor-pointer object-contain"
            alt="Auth0 logo"
          />
        </a>
      </div>
      <h2 className="text-2xl font-bold">Hono + React + AI SDK + Auth0</h2>
      <Button variant="secondary" asChild>
        <a target="_blank" href="https://github.com/auth0-samples/auth0-ai-samples/tree/main/call-apis-on-users-behalf/others-api/vercel-react-spa-js">
          Docs
        </a>
      </Button>

      {!isAuthenticated ? (
        <div className="flex flex-col items-center gap-4">
          <p>Please log in to continue</p>
          <Button onClick={() => login()}>Log In</Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="text-center">
            <p>Welcome, {user?.name || user?.email || "User"}!</p>
            <div className="mt-2 flex justify-center">
              <Avatar
                src={user?.picture}
                name={user?.name || user?.email || "User"}
                size={48}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={sendRequest}>Call Public API</Button>
            <Button onClick={sendProtectedRequest}>Call Protected API</Button>
            <Button variant="outline" onClick={() => logout()}>
              Log Out
            </Button>
          </div>

          {data && (
            <pre className="bg-gray-100 p-4 rounded-md">
              <code>
                Message: {data.message} <br />
                Success: {data.success.toString()}
              </code>
            </pre>
          )}
          {/* Chat component for authenticated users */}
          <div className="w-full mt-8">
            <Chat />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
