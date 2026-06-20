import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { generateSkinPlanFromRequest, readRequestBody } from "./src/server/skinAi";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "./",
    plugins: [react(), skinAiPlugin(env)],
  };
});

function skinAiPlugin(env: Record<string, string>): Plugin {
  return {
    name: "mcaisd-skin-ai-api",
    configureServer(server) {
      server.middlewares.use("/api/generate-skin", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const plan = await generateSkinPlanFromRequest(JSON.parse(await readRequestBody(req)), env);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(plan));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(error instanceof Error ? error.message : "AI generation failed");
        }
      });
    },
  };
}
