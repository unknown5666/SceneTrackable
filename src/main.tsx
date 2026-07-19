import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "@/state/theme";
import { applyAppearance, readAppearance } from "@/lib/appearance";
import "./index.css";

// Personal accent + density, applied before first paint.
applyAppearance(readAppearance());

// Cloud sync is no longer opt-in: MainLayout resumes it for any signed-in
// user, and store.login() attaches it for new sessions.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
