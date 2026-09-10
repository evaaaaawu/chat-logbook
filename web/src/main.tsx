import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// React Grab: dev-only. Point at any element in the running app and press ⌘C
// to copy its component name, source file, and HTML for pasting into an agent.
if (import.meta.env.DEV) {
  import("react-grab");
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html is missing its #root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
