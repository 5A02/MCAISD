import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";

type SkinStyle = "adventure" | "cyberpunk" | "medieval" | "school" | "magic" | "mecha";
type SkinModel = "steve" | "alex";

type SkinOptions = {
  prompt?: string;
  style?: SkinStyle;
  model?: SkinModel;
  mainColor?: string;
  hairColor?: string;
  accessory?: string;
  complexity?: number;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
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
          const options = normalizeOptions(JSON.parse(await readRequestBody(req)));
          const plan = await callLlm(options, env);
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

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > 32_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeOptions(input: SkinOptions): Required<SkinOptions> {
  return {
    prompt: String(input.prompt || "Minecraft skin").slice(0, 800),
    style: normalizeStyle(input.style),
    model: input.model === "alex" ? "alex" : "steve",
    mainColor: normalizeHex(input.mainColor, "#2f80ed"),
    hairColor: normalizeHex(input.hairColor, "#f5f7ff"),
    accessory: String(input.accessory || "无").slice(0, 40),
    complexity: clampInt(Number(input.complexity || 5), 1, 9),
  };
}

async function callLlm(options: Required<SkinOptions>, env: Record<string, string>) {
  const baseUrl = env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = env.LLM_MODEL || "qwen-plus";
  const apiKey = env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error("Missing LLM_API_KEY in .env.local");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You design Minecraft 64x64 skins. Return strict JSON only. Use hex colors. Valid styles: adventure, cyberpunk, medieval, school, magic, mecha. Valid model: steve or alex.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a structured Minecraft skin plan and 4 variants for a local pixel renderer.",
            input: options,
            schema: {
              prompt: "string",
              style: "adventure|cyberpunk|medieval|school|magic|mecha",
              model: "steve|alex",
              mainColor: "#RRGGBB",
              hairColor: "#RRGGBB",
              accessory: "无|耳机|面具|围巾|披风",
              complexity: "1-9 integer",
              variants: [
                {
                  prompt: "string with visual details",
                  mainColor: "#RRGGBB",
                  hairColor: "#RRGGBB",
                  accessory: "string",
                  style: "style",
                  complexity: "1-9 integer",
                },
              ],
            },
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned no content");
  }

  return sanitizePlan(parseJsonContent(content), options);
}

function sanitizePlan(raw: any, fallback: Required<SkinOptions>) {
  const variants = Array.isArray(raw?.variants) ? raw.variants.slice(0, 4) : [];
  const base = {
    prompt: String(raw?.prompt || fallback.prompt),
    style: normalizeStyle(raw?.style || fallback.style),
    model: raw?.model === "alex" ? "alex" : fallback.model,
    mainColor: normalizeHex(raw?.mainColor, fallback.mainColor),
    hairColor: normalizeHex(raw?.hairColor, fallback.hairColor),
    accessory: String(raw?.accessory || fallback.accessory).slice(0, 40),
    complexity: clampInt(Number(raw?.complexity || fallback.complexity), 1, 9),
  };

  return {
    ...base,
    variants: Array.from({ length: 4 }, (_, index) => {
      const variant = variants[index] || {};
      return {
        prompt: String(variant.prompt || `${base.prompt} variant ${index + 1}`),
        mainColor: normalizeHex(variant.mainColor, base.mainColor),
        hairColor: normalizeHex(variant.hairColor, base.hairColor),
        accessory: String(variant.accessory || base.accessory).slice(0, 40),
        style: normalizeStyle(variant.style || base.style),
        complexity: clampInt(Number(variant.complexity || base.complexity), 1, 9),
      };
    }),
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function normalizeStyle(value: unknown): SkinStyle {
  const allowed: SkinStyle[] = ["adventure", "cyberpunk", "medieval", "school", "magic", "mecha"];
  return allowed.includes(value as SkinStyle) ? (value as SkinStyle) : "cyberpunk";
}

function normalizeHex(value: unknown, fallback: string): string {
  const text = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
