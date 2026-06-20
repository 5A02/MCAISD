import { app, BrowserWindow } from "electron";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { generateSkinPlanFromRequest, readRequestBody } from "../src/server/skinAi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let apiServer: Server | null = null;
let apiPort = 0;

async function startApiServer(): Promise<number> {
  if (apiServer && apiPort > 0) return apiPort;

  apiServer = createServer(async (req, res) => {
    if (!req.url?.startsWith("/api/generate-skin")) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }

    try {
      const plan = await generateSkinPlanFromRequest(JSON.parse(await readRequestBody(req)), envFromProcess());
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(plan));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(error instanceof Error ? error.message : "AI generation failed");
    }
  });

  return new Promise((resolve, reject) => {
    apiServer?.once("error", reject);
    apiServer?.listen(0, "127.0.0.1", () => {
      const address = apiServer?.address();
      if (typeof address === "object" && address?.port) {
        apiPort = address.port;
        resolve(apiPort);
      } else {
        reject(new Error("Failed to start local API server"));
      }
    });
  });
}

function envFromProcess(): Record<string, string> {
  return {
    LLM_PROVIDER: process.env.LLM_PROVIDER || "dashscope",
    LLM_MODEL: process.env.LLM_MODEL || "qwen-plus",
    LLM_BASE_URL: process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    LLM_API_KEY: process.env.LLM_API_KEY || "",
  };
}

async function createMainWindow(): Promise<void> {
  const port = await startApiServer();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#f4f6fa",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const entry = pathToFileURL(join(__dirname, "../dist/index.html"));
  entry.searchParams.set("apiBase", `http://127.0.0.1:${port}`);
  await window.loadURL(entry.toString());
}

app.whenReady().then(createMainWindow);

app.on("window-all-closed", () => {
  apiServer?.close();
  apiServer = null;

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});
