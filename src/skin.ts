export type Tool = "brush" | "eraser" | "picker";

export type SkinModel = "steve" | "alex";

export type SkinStyle =
  | "adventure"
  | "cyberpunk"
  | "medieval"
  | "school"
  | "magic"
  | "mecha";

export type SkinOptions = {
  prompt: string;
  style: SkinStyle;
  model: SkinModel;
  mainColor: string;
  hairColor: string;
  accessory: string;
  complexity: number;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DrawCommand =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string; alpha?: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; color: string; alpha?: number }
  | { type: "pixel"; x: number; y: number; color: string; alpha?: number }
  | { type: "checker"; x: number; y: number; w: number; h: number; colorA: string; colorB: string; alpha?: number };

export const SKIN_SIZE = 64;

export const PART_RECTS: Record<string, Rect[]> = {
  head: [
    { x: 8, y: 8, w: 8, h: 8 },
    { x: 0, y: 8, w: 8, h: 8 },
    { x: 16, y: 8, w: 8, h: 8 },
    { x: 24, y: 8, w: 8, h: 8 },
    { x: 8, y: 0, w: 8, h: 8 },
    { x: 16, y: 0, w: 8, h: 8 },
  ],
  torso: [
    { x: 20, y: 20, w: 8, h: 12 },
    { x: 16, y: 20, w: 4, h: 12 },
    { x: 28, y: 20, w: 4, h: 12 },
    { x: 32, y: 20, w: 8, h: 12 },
    { x: 20, y: 16, w: 8, h: 4 },
    { x: 28, y: 16, w: 8, h: 4 },
  ],
  rightArm: [
    { x: 44, y: 20, w: 4, h: 12 },
    { x: 40, y: 20, w: 4, h: 12 },
    { x: 48, y: 20, w: 4, h: 12 },
    { x: 52, y: 20, w: 4, h: 12 },
    { x: 44, y: 16, w: 4, h: 4 },
    { x: 48, y: 16, w: 4, h: 4 },
  ],
  leftArm: [
    { x: 36, y: 52, w: 4, h: 12 },
    { x: 32, y: 52, w: 4, h: 12 },
    { x: 40, y: 52, w: 4, h: 12 },
    { x: 44, y: 52, w: 4, h: 12 },
    { x: 36, y: 48, w: 4, h: 4 },
    { x: 40, y: 48, w: 4, h: 4 },
  ],
  rightLeg: [
    { x: 4, y: 20, w: 4, h: 12 },
    { x: 0, y: 20, w: 4, h: 12 },
    { x: 8, y: 20, w: 4, h: 12 },
    { x: 12, y: 20, w: 4, h: 12 },
    { x: 4, y: 16, w: 4, h: 4 },
    { x: 8, y: 16, w: 4, h: 4 },
  ],
  leftLeg: [
    { x: 20, y: 52, w: 4, h: 12 },
    { x: 16, y: 52, w: 4, h: 12 },
    { x: 24, y: 52, w: 4, h: 12 },
    { x: 28, y: 52, w: 4, h: 12 },
    { x: 20, y: 48, w: 4, h: 4 },
    { x: 24, y: 48, w: 4, h: 4 },
  ],
};

const STYLE_COLORS: Record<SkinStyle, string[]> = {
  adventure: ["#3d6f48", "#8fbf5d", "#6b4f2a", "#d8b56d"],
  cyberpunk: ["#00d4ff", "#ff3df2", "#14181f", "#f5f7ff"],
  medieval: ["#6f1d1b", "#b08968", "#273618", "#d6ccc2"],
  school: ["#2b50aa", "#f5f1e3", "#8d99ae", "#ef476f"],
  magic: ["#4a148c", "#26c6da", "#f9c74f", "#f8f7ff"],
  mecha: ["#2f3542", "#ced6e0", "#ff4757", "#70a1ff"],
};

export function makeEmptySkin(): ImageData {
  return new ImageData(SKIN_SIZE, SKIN_SIZE);
}

export function cloneImageData(source: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
}

export function applyDrawCommands(source: ImageData, commands: DrawCommand[] = []): ImageData {
  const next = cloneImageData(source);
  commands.slice(0, 120).forEach((command) => {
    if (command.type === "rect") {
      const rect = clampRect(command.x, command.y, command.w, command.h);
      if (!rect) return;
      fillRect(next, rect.x, rect.y, rect.w, rect.h, normalizeCommandColor(command.color), normalizeAlpha(command.alpha));
      return;
    }

    if (command.type === "checker") {
      const rect = clampRect(command.x, command.y, command.w, command.h);
      if (!rect) return;
      drawChecker(
        next,
        rect,
        normalizeCommandColor(command.colorA),
        normalizeCommandColor(command.colorB),
        normalizeAlpha(command.alpha),
      );
      return;
    }

    if (command.type === "line") {
      drawLine(
        next,
        clampIntRange(command.x1, 0, SKIN_SIZE - 1),
        clampIntRange(command.y1, 0, SKIN_SIZE - 1),
        clampIntRange(command.x2, 0, SKIN_SIZE - 1),
        clampIntRange(command.y2, 0, SKIN_SIZE - 1),
        normalizeCommandColor(command.color),
        normalizeAlpha(command.alpha),
      );
      return;
    }

    if (command.type === "pixel") {
      setRawPixel(
        next,
        clampIntRange(command.x, 0, SKIN_SIZE - 1),
        clampIntRange(command.y, 0, SKIN_SIZE - 1),
        normalizeCommandColor(command.color),
        normalizeAlpha(command.alpha),
      );
    }
  });
  return next;
}

export function generateSkin(options: SkinOptions, variant = 0): ImageData {
  const image = makeEmptySkin();
  const rng = createRng(hashText(JSON.stringify(options) + variant));
  const palette = buildPalette(options);
  const skinTone = pickSkinTone(options.prompt, rng);
  const pants = shade(palette.main, -34);
  const shoes = shade(palette.accent, -54);
  const sleeve = shade(palette.main, 18);

  fillRects(image, PART_RECTS.head, skinTone);
  fillRects(image, PART_RECTS.torso, palette.main);
  fillRects(image, PART_RECTS.rightArm, sleeve);
  fillRects(image, PART_RECTS.leftArm, sleeve);
  fillRects(image, PART_RECTS.rightLeg, pants);
  fillRects(image, PART_RECTS.leftLeg, pants);

  drawFace(image, options.hairColor, palette.accent, rng);
  drawHair(image, options.hairColor, rng, options.prompt);
  drawTorsoDetails(image, palette, options.style, rng);
  drawArmDetails(image, palette, options.model);
  drawLegDetails(image, shoes, palette.accent);
  drawAccessory(image, options.accessory, palette, rng);
  scatterHighlights(image, palette, options.complexity, rng);

  return image;
}

export function drawImageDataToCanvas(canvas: HTMLCanvasElement, imageData: ImageData, scale = 1): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = imageData.width * scale;
  canvas.height = imageData.height * scale;
  const temp = document.createElement("canvas");
  temp.width = imageData.width;
  temp.height = imageData.height;
  temp.getContext("2d")?.putImageData(imageData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(temp, 0, 0, canvas.width, canvas.height);
}

export function setPixel(image: ImageData, x: number, y: number, hex: string, alpha = 255): ImageData {
  if (x < 0 || y < 0 || x >= SKIN_SIZE || y >= SKIN_SIZE) return image;
  const next = cloneImageData(image);
  const [r, g, b] = hexToRgb(hex);
  const i = (Math.floor(y) * SKIN_SIZE + Math.floor(x)) * 4;
  next.data[i] = r;
  next.data[i + 1] = g;
  next.data[i + 2] = b;
  next.data[i + 3] = alpha;
  return next;
}

export function getPixelHex(image: ImageData, x: number, y: number): string {
  const px = Math.max(0, Math.min(SKIN_SIZE - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(SKIN_SIZE - 1, Math.floor(y)));
  const i = (py * SKIN_SIZE + px) * 4;
  return rgbToHex(image.data[i], image.data[i + 1], image.data[i + 2]);
}

export function exportSkin(image: ImageData, filename: string): void {
  const canvas = document.createElement("canvas");
  canvas.width = SKIN_SIZE;
  canvas.height = SKIN_SIZE;
  canvas.getContext("2d")?.putImageData(image, 0, 0);
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function imageDataToTextureUrl(image: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = SKIN_SIZE;
  canvas.height = SKIN_SIZE;
  canvas.getContext("2d")?.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function fillRects(image: ImageData, rects: Rect[], color: string): void {
  rects.forEach((rect, index) => {
    const tone = shade(color, index % 2 === 0 ? 0 : -8);
    fillRect(image, rect.x, rect.y, rect.w, rect.h, tone);
  });
}

function fillRect(image: ImageData, x: number, y: number, w: number, h: number, color: string, alpha = 255): void {
  const [r, g, b] = hexToRgb(color);
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const i = (py * SKIN_SIZE + px) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = alpha;
    }
  }
}

function drawChecker(image: ImageData, rect: Rect, colorA: string, colorB: string, alpha = 255): void {
  for (let py = rect.y; py < rect.y + rect.h; py += 1) {
    for (let px = rect.x; px < rect.x + rect.w; px += 1) {
      setRawPixel(image, px, py, (px + py) % 2 === 0 ? colorA : colorB, alpha);
    }
  }
}

function drawLine(image: ImageData, x1: number, y1: number, x2: number, y2: number, color: string, alpha = 255): void {
  let currentX = x1;
  let currentY = y1;
  const dx = Math.abs(x2 - x1);
  const sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1);
  const sy = y1 < y2 ? 1 : -1;
  let error = dx + dy;

  while (true) {
    setRawPixel(image, currentX, currentY, color, alpha);
    if (currentX === x2 && currentY === y2) break;
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      currentX += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      currentY += sy;
    }
  }
}

function setRawPixel(image: ImageData, x: number, y: number, color: string, alpha = 255): void {
  if (x < 0 || y < 0 || x >= SKIN_SIZE || y >= SKIN_SIZE) return;
  const [r, g, b] = hexToRgb(color);
  const i = (y * SKIN_SIZE + x) * 4;
  image.data[i] = r;
  image.data[i + 1] = g;
  image.data[i + 2] = b;
  image.data[i + 3] = alpha;
}

function drawFace(image: ImageData, hair: string, accent: string, rng: () => number): void {
  const eye = shade(accent, -24);
  setRawPixel(image, 11, 12, eye);
  setRawPixel(image, 14, 12, eye);
  setRawPixel(image, 11, 13, "#101114");
  setRawPixel(image, 14, 13, "#101114");
  setRawPixel(image, 12, 15, rng() > 0.5 ? "#8b4d46" : shade(hair, 28));
  setRawPixel(image, 13, 15, rng() > 0.5 ? "#8b4d46" : shade(hair, 28));
}

function drawHair(image: ImageData, hair: string, rng: () => number, prompt: string): void {
  fillRect(image, 8, 8, 8, 2, hair);
  fillRect(image, 8, 10, 1, 5, shade(hair, -8));
  fillRect(image, 15, 10, 1, 4, shade(hair, -14));
  for (let x = 9; x <= 14; x += 1) {
    if (rng() > 0.4) setRawPixel(image, x, 10 + Math.floor(rng() * 2), shade(hair, 18));
  }
  if (/long|长发|双马尾|girl|女生|女/.test(prompt.toLowerCase())) {
    fillRect(image, 8, 13, 1, 3, hair);
    fillRect(image, 15, 13, 1, 3, hair);
  }
}

function drawTorsoDetails(image: ImageData, palette: ReturnType<typeof buildPalette>, style: SkinStyle, rng: () => number): void {
  fillRect(image, 20, 20, 8, 2, shade(palette.main, 26));
  fillRect(image, 20, 30, 8, 2, shade(palette.main, -24));
  fillRect(image, 23, 20, 2, 8, shade(palette.main, -12));
  fillRect(image, 24, 22, 1, 1, palette.accent);
  fillRect(image, 24, 25, 1, 1, palette.accent);

  if (style === "cyberpunk" || style === "mecha") {
    fillRect(image, 21, 23, 6, 1, palette.accent);
    fillRect(image, 22, 26, 4, 1, palette.secondary);
    setRawPixel(image, 23, 24, "#ffffff");
  }

  if (style === "medieval" || style === "adventure") {
    fillRect(image, 21, 21, 6, 1, palette.secondary);
    fillRect(image, 20, 27, 8, 1, shade(palette.secondary, -22));
  }

  if (style === "magic") {
    setRawPixel(image, 24, 24, palette.accent);
    setRawPixel(image, 23, 25, palette.secondary);
    setRawPixel(image, 25, 25, palette.secondary);
    if (rng() > 0.3) setRawPixel(image, 24, 26, "#ffffff");
  }
}

function drawArmDetails(image: ImageData, palette: ReturnType<typeof buildPalette>, model: SkinModel): void {
  const armWidth = model === "alex" ? 3 : 4;
  fillRect(image, 44, 29, armWidth, 3, shade(palette.skinTone, -5));
  fillRect(image, 36, 61, armWidth, 3, shade(palette.skinTone, -5));
  fillRect(image, 44, 20, armWidth, 2, shade(palette.main, 16));
  fillRect(image, 36, 52, armWidth, 2, shade(palette.main, 16));
}

function drawLegDetails(image: ImageData, shoes: string, accent: string): void {
  fillRect(image, 4, 29, 4, 3, shoes);
  fillRect(image, 20, 61, 4, 3, shoes);
  setRawPixel(image, 5, 28, accent);
  setRawPixel(image, 21, 60, accent);
}

function drawAccessory(image: ImageData, accessory: string, palette: ReturnType<typeof buildPalette>, rng: () => number): void {
  const label = accessory.toLowerCase();
  if (label.includes("headset") || label.includes("耳机")) {
    setRawPixel(image, 8, 12, "#20242c");
    setRawPixel(image, 15, 12, "#20242c");
    setRawPixel(image, 10, 8, palette.accent);
    setRawPixel(image, 13, 8, palette.accent);
  }
  if (label.includes("mask") || label.includes("面具")) {
    fillRect(image, 10, 14, 5, 1, shade(palette.secondary, -18));
  }
  if (label.includes("scarf") || label.includes("围巾")) {
    fillRect(image, 20, 20, 8, 1, palette.accent);
    fillRect(image, 27, 21, 1, 4, palette.accent);
  }
  if (label.includes("cape") || label.includes("披风")) {
    fillRect(image, 32, 22, 8, 10, shade(palette.accent, -16));
    for (let y = 23; y < 31; y += 2) {
      setRawPixel(image, 33 + Math.floor(rng() * 5), y, shade(palette.accent, 26));
    }
  }
}

function scatterHighlights(image: ImageData, palette: ReturnType<typeof buildPalette>, complexity: number, rng: () => number): void {
  const total = Math.floor(18 + complexity * 6);
  const drawable = [
    ...PART_RECTS.torso,
    ...PART_RECTS.rightArm,
    ...PART_RECTS.leftArm,
    ...PART_RECTS.rightLeg,
    ...PART_RECTS.leftLeg,
  ];
  for (let i = 0; i < total; i += 1) {
    const rect = drawable[Math.floor(rng() * drawable.length)];
    const x = rect.x + Math.floor(rng() * rect.w);
    const y = rect.y + Math.floor(rng() * rect.h);
    setRawPixel(image, x, y, rng() > 0.5 ? shade(palette.main, 34) : shade(palette.main, -34), Math.floor(210 + rng() * 45));
  }
}

function buildPalette(options: SkinOptions) {
  const styleColors = STYLE_COLORS[options.style];
  return {
    main: options.mainColor || styleColors[0],
    secondary: styleColors[1],
    accent: styleColors[2 + (hashText(options.prompt) % 2)],
    skinTone: pickSkinTone(options.prompt, createRng(hashText(options.prompt))),
  };
}

function pickSkinTone(prompt: string, rng: () => number): string {
  if (/robot|机器人|mecha|机甲/.test(prompt.toLowerCase())) return "#b8c0cc";
  const tones = ["#f1c9a5", "#d99b6c", "#b87950", "#f0d0b0", "#8d5a3b"];
  return tones[Math.floor(rng() * tones.length)];
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized.length === 3 ? normalized.split("").map((x) => x + x).join("") : normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(clamp(r + amount), clamp(g + amount), clamp(b + amount));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampRect(x: number, y: number, w: number, h: number): Rect | null {
  const left = clampIntRange(x, 0, SKIN_SIZE - 1);
  const top = clampIntRange(y, 0, SKIN_SIZE - 1);
  const right = clampIntRange(x + Math.max(1, Math.round(w)) - 1, 0, SKIN_SIZE - 1);
  const bottom = clampIntRange(y + Math.max(1, Math.round(h)) - 1, 0, SKIN_SIZE - 1);
  if (right < left || bottom < top) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

function clampIntRange(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, Math.round(normalized)));
}

function normalizeAlpha(alpha: number | undefined): number {
  return clampIntRange(alpha ?? 255, 0, 255);
}

function normalizeCommandColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#111111";
}

function hashText(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
