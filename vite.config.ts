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

type DrawCommand =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string; alpha?: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; color: string; alpha?: number }
  | { type: "pixel"; x: number; y: number; color: string; alpha?: number }
  | { type: "checker"; x: number; y: number; w: number; h: number; colorA: string; colorB: string; alpha?: number };

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
    style: inferStyle(String(input.prompt || "Minecraft skin")),
    model: input.model === "alex" ? "alex" : "steve",
    mainColor: normalizeHex(input.mainColor, "#2f80ed"),
    hairColor: normalizeHex(input.hairColor, "#f5f7ff"),
    accessory: "无",
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
      temperature: 0.35,
      max_tokens: 7000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You translate user prompts into structured Minecraft Java skin options. Return strict JSON only. Use #RRGGBB colors. Do not output pixel instructions. Preserve the user's requested character identity, colors, equipment, and era.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a faithful Minecraft skin plan and 4 semantic variants. Every variant must keep the requested character identity. Vary only trim, color accents, equipment wording, and detail density.",
            input: options,
            commandRules: [
              "Do not change the user's character role, species, gender, era, equipment, or named colors.",
              "All 4 variants must keep every explicit object requested by the user. Vary only layout, trim, ornament density, and small color accents.",
              "If the user says knight, every variant is a knight. Do not output squire, apothecary, herald, mage, robot, or unrelated roles.",
              "Make the 4 variants meaningfully different while matching the same prompt.",
            ],
            schema: {
              prompt: "string",
              model: "steve|alex",
              mainColor: "#RRGGBB",
              hairColor: "#RRGGBB",
              complexity: "1-9 integer",
              variants: [
                {
                  prompt: "string with visual details",
                  mainColor: "#RRGGBB",
                  hairColor: "#RRGGBB",
                  complexity: "1-9 integer",
                  notes: ["short reasons for key visual decisions"],
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
    style: inferStyle(String(raw?.prompt || fallback.prompt)),
    model: raw?.model === "alex" ? "alex" : fallback.model,
    mainColor: normalizeHex(raw?.mainColor, fallback.mainColor),
    hairColor: normalizeHex(raw?.hairColor, fallback.hairColor),
    accessory: "无",
    complexity: clampInt(Number(raw?.complexity || fallback.complexity), 1, 9),
  };

  return {
    ...base,
    variants: Array.from({ length: 4 }, (_, index) => {
      const variant = variants[index] || {};
      const variantDetail = String(variant.prompt || `variant ${index + 1}`).slice(0, 240);
      const mainColor = normalizeHex(variant.mainColor, base.mainColor);
      const hairColor = normalizeHex(variant.hairColor, base.hairColor);
      const accessory = "无";
      const style = inferStyle(`${fallback.prompt} ${variantDetail}`);
      const complexity = clampInt(Number(variant.complexity || base.complexity), 1, 9);
      const anchoredOptions = {
        prompt: fallback.prompt,
        style,
        model: base.model,
        mainColor,
        hairColor,
        accessory,
        complexity,
      };
      return {
        prompt: `${fallback.prompt} | variant ${index + 1}: ${variantDetail}`.slice(0, 520),
        mainColor,
        hairColor,
        accessory,
        style,
        complexity,
        notes: normalizeNotes(variant.notes),
        drawCommands: [],
      };
    }),
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function inferStyle(prompt: string): SkinStyle {
  const text = prompt.toLowerCase();
  if (matchesAny(text, ["mecha", "robot", "机甲", "机器人"])) return "mecha";
  if (matchesAny(text, ["magic", "wizard", "star", "魔法", "法师", "星星"])) return "magic";
  if (matchesAny(text, ["medieval", "knight", "armor", "中世纪", "骑士", "盔甲"])) return "medieval";
  if (matchesAny(text, ["school", "校服", "校园"])) return "school";
  if (matchesAny(text, ["cyber", "neon", "赛博", "霓虹"])) return "cyberpunk";
  return "adventure";
}

function normalizeHex(value: unknown, fallback: string): string {
  const text = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function normalizeNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item) => String(item).slice(0, 120));
}

function normalizeDrawCommands(value: unknown): DrawCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const command = item as Record<string, unknown>;
    if (command.type === "rect") {
      const rect = normalizeRect(command.x, command.y, command.w, command.h);
      if (!rect) return [];
      if (rect.w * rect.h > 18) return [];
      return [
        {
          type: "rect" as const,
          ...rect,
          color: normalizeHex(command.color, "#111111"),
          alpha: normalizeAlpha(command.alpha),
        },
      ];
    }

    if (command.type === "checker") {
      const rect = normalizeRect(command.x, command.y, command.w, command.h);
      if (!rect) return [];
      if (rect.w * rect.h > 18) return [];
      return [
        {
          type: "checker" as const,
          ...rect,
          colorA: normalizeHex(command.colorA, "#111111"),
          colorB: normalizeHex(command.colorB, "#eeeeee"),
          alpha: normalizeAlpha(command.alpha),
        },
      ];
    }

    if (command.type === "line") {
      return [
        {
          type: "line" as const,
          x1: clampInt(Number(command.x1), 0, 63),
          y1: clampInt(Number(command.y1), 0, 63),
          x2: clampInt(Number(command.x2), 0, 63),
          y2: clampInt(Number(command.y2), 0, 63),
          color: normalizeHex(command.color, "#111111"),
          alpha: normalizeAlpha(command.alpha),
        },
      ];
    }

    if (command.type === "pixel") {
      return [
        {
          type: "pixel" as const,
          x: clampInt(Number(command.x), 0, 63),
          y: clampInt(Number(command.y), 0, 63),
          color: normalizeHex(command.color, "#111111"),
          alpha: normalizeAlpha(command.alpha),
        },
      ];
    }

    return [];
  }).slice(0, 120);
}

function normalizeRect(x: unknown, y: unknown, w: unknown, h: unknown) {
  const left = clampInt(Number(x), 0, 63);
  const top = clampInt(Number(y), 0, 63);
  const width = clampInt(Number(w), 1, 64);
  const height = clampInt(Number(h), 1, 64);
  const right = Math.min(63, left + width - 1);
  const bottom = Math.min(63, top + height - 1);
  if (right < left || bottom < top) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

function normalizeAlpha(value: unknown): number {
  return clampInt(Number(value ?? 255), 0, 255);
}

function buildMandatoryDrawCommands(options: Required<SkinOptions>): DrawCommand[] {
  const prompt = `${options.prompt} ${options.accessory}`.toLowerCase();
  const commands: DrawCommand[] = [];
  const accent = readableAccent(options.mainColor);

  if (matchesAny(prompt, ["shield", "crest", "emblem", "logo", "盾", "盾牌", "标志", "徽章"])) {
    commands.push(
      { type: "rect", x: 22, y: 23, w: 4, h: 1, color: "#ffffff", alpha: 255 },
      { type: "rect", x: 22, y: 24, w: 4, h: 2, color: "#ffffff", alpha: 255 },
      { type: "rect", x: 23, y: 26, w: 2, h: 2, color: "#ffffff", alpha: 255 },
      { type: "line", x1: 22, y1: 23, x2: 22, y2: 25, color: accent, alpha: 255 },
      { type: "line", x1: 25, y1: 23, x2: 25, y2: 25, color: accent, alpha: 255 },
    );
  }

  if (matchesAny(prompt, ["helmet", "helm", "visor", "头盔", "面罩", "面具"])) {
    commands.push(
      { type: "rect", x: 8, y: 8, w: 8, h: 3, color: "#111111", alpha: 255 },
      { type: "rect", x: 8, y: 11, w: 1, h: 4, color: "#111111", alpha: 255 },
      { type: "rect", x: 15, y: 11, w: 1, h: 4, color: "#111111", alpha: 255 },
      { type: "rect", x: 40, y: 8, w: 8, h: 2, color: "#111111", alpha: 235 },
      { type: "line", x1: 10, y1: 12, x2: 14, y2: 12, color: accent, alpha: 255 },
    );
  }

  return commands;
}

function readableAccent(background: string): string {
  const value = parseInt(background.replace("#", ""), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return r + g + b > 430 ? "#111111" : "#d8b56d";
}

function matchesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
