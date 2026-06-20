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

export async function readRequestBody(req: IncomingMessage): Promise<string> {
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

export async function generateSkinPlanFromRequest(input: SkinOptions, env: Record<string, string>) {
  const options = normalizeOptions(input);
  return callLlm(options, env);
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

function matchesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
