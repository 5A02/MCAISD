import React from "react";
import { createRoot } from "react-dom/client";
import "./material-web";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
