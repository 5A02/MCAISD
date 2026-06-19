import type { SkinModel, SkinOptions, SkinStyle } from "./skin";

export type AiSkinPlan = {
  prompt: string;
  style: SkinStyle;
  model: SkinModel;
  mainColor: string;
  hairColor: string;
  accessory: string;
  complexity: number;
  variants: Array<{
    prompt: string;
    mainColor: string;
    hairColor: string;
    accessory: string;
    style: SkinStyle;
    complexity: number;
  }>;
};

export async function generateSkinPlan(options: SkinOptions): Promise<AiSkinPlan> {
  const response = await fetch("/api/generate-skin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `AI request failed with ${response.status}`);
  }

  return response.json() as Promise<AiSkinPlan>;
}
