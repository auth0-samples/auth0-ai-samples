import "./index.css";

import { NuqsAdapter } from "nuqs/adapters/react-router/v6";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";

import App from "./App.tsx";
import { Auth0Provider } from "./providers/Auth0.tsx";
import { StreamProvider } from "./providers/Stream.tsx";
import { ThreadProvider } from "./providers/Thread.tsx";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <NuqsAdapter>
      <Auth0Provider>
        <ThreadProvider>
          <StreamProvider>
            <App />
          </StreamProvider>
        </ThreadProvider>
      </Auth0Provider>
      <Toaster />
    </NuqsAdapter>
  </BrowserRouter>,
);
