import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "@/state/theme";
import { cloudEnabled, autoSyncEnabled, startAutoSync } from "@/lib/cloud";
import "./index.css";

// Resume cloud auto-sync across reloads when it was enabled.
if (cloudEnabled && autoSyncEnabled()) startAutoSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
