import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { Auth0Provider } from "./contexts/Auth0Context.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Auth0Provider>
      <App />
    </Auth0Provider>
  </StrictMode>
);
