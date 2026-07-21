import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const qaParams = new URLSearchParams(window.location.search);
if (qaParams.has("qa") || qaParams.has("glazing")) {
  const qaLog = { console: [], errors: [], rejections: [] };
  const syncQaLog = () => {
    document.documentElement.dataset.qaConsoleWarnings = String(qaLog.console.filter((item) => item.level === "warn").length);
    document.documentElement.dataset.qaConsoleErrors = String(qaLog.console.filter((item) => item.level === "error").length + qaLog.errors.length);
    document.documentElement.dataset.qaUnhandledRejections = String(qaLog.rejections.length);
  };
  const serialize = (value) => {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); }
    catch { return String(value); }
  };
  ["warn", "error"].forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      qaLog.console.push({ level, message: args.map(serialize).join(" ") });
      syncQaLog();
      original(...args);
    };
  });
  window.addEventListener("error", (event) => {
    qaLog.errors.push(event.message);
    syncQaLog();
  });
  window.addEventListener("unhandledrejection", (event) => {
    qaLog.rejections.push(serialize(event.reason));
    syncQaLog();
  });
  Object.defineProperty(window, "__KOKOS_QA__", { value: qaLog, configurable: false });
  syncQaLog();
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
