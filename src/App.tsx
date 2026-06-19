import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  Brush,
  Download,
  Eraser,
  Eye,
  EyeOff,
  History,
  Image as ImageIcon,
  Import,
  Pipette,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { generateSkinPlan } from "./aiClient";
import {
  applyDrawCommands,
  cloneImageData,
  drawImageDataToCanvas,
  exportSkin,
  generateSkin,
  getPixelHex,
  imageDataToTextureUrl,
  makeEmptySkin,
  setPixel,
  type SkinModel,
  type SkinOptions,
  type SkinStyle,
  type Tool,
} from "./skin";

type Candidate = {
  id: string;
  image: ImageData;
};

const examples = [
  "蓝色卫衣、白发、赛博风、背后有披风的男生",
  "红黑配色的中世纪骑士，胸前有盾牌标志",
  "绿色眼睛的魔法少女，紫色长袍和星星装饰",
  "银灰色机器人，机甲外套，蓝色发光线条",
];

const styles: Array<{ value: SkinStyle; label: string }> = [
  { value: "adventure", label: "冒险" },
  { value: "cyberpunk", label: "赛博" },
  { value: "medieval", label: "中世纪" },
  { value: "school", label: "校园" },
  { value: "magic", label: "魔法" },
  { value: "mecha", label: "机甲" },
];

const accessories = ["无", "耳机", "面具", "围巾", "披风"];

export default function App() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const promptFieldRef = useRef<HTMLElement & { value: string }>(null);
  const modelSelectRef = useRef<HTMLElement & { value: string }>(null);
  const accessorySelectRef = useRef<HTMLElement & { value: string }>(null);
  const complexitySliderRef = useRef<HTMLElement & { value: number }>(null);
  const generateButtonRef = useRef<HTMLElement | null>(null);
  const generateRef = useRef<() => void>(() => undefined);
  const [options, setOptions] = useState<SkinOptions>({
    prompt: examples[0],
    style: "cyberpunk",
    model: "steve",
    mainColor: "#2f80ed",
    hairColor: "#f5f7ff",
    accessory: "披风",
    complexity: 5,
  });
  const [candidates, setCandidates] = useState<Candidate[]>(() =>
    [0, 1, 2].map((variant) => ({
      id: `seed-${variant}`,
      image: generateSkin(
        {
          prompt: examples[0],
          style: "cyberpunk",
          model: "steve",
          mainColor: "#2f80ed",
          hairColor: "#f5f7ff",
          accessory: "披风",
          complexity: 5,
        },
        variant,
      ),
    })),
  );
  const [selected, setSelected] = useState<ImageData>(() => cloneImageData(candidates[0].image));
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#00d4ff");
  const [showGrid, setShowGrid] = useState(true);
  const [showOuterLayer, setShowOuterLayer] = useState(true);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("AI 已接入 DashScope");

  const textureUrl = useMemo(() => imageDataToTextureUrl(selected), [selected]);

  useEffect(() => {
    if (promptFieldRef.current && promptFieldRef.current.value !== options.prompt) {
      promptFieldRef.current.value = options.prompt;
    }
    if (modelSelectRef.current && modelSelectRef.current.value !== options.model) {
      modelSelectRef.current.value = options.model;
    }
    if (accessorySelectRef.current && accessorySelectRef.current.value !== options.accessory) {
      accessorySelectRef.current.value = options.accessory;
    }
    if (complexitySliderRef.current && complexitySliderRef.current.value !== options.complexity) {
      complexitySliderRef.current.value = options.complexity;
    }
  }, [options]);

  function updateOption<K extends keyof SkinOptions>(key: K, value: SkinOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  async function generate() {
    setIsGenerating(true);
    setGenerationStatus("正在调用 AI 解析角色描述");
    try {
      const plan = await generateSkinPlan(options);
      const nextOptions: SkinOptions = {
        prompt: plan.prompt,
        style: plan.style,
        model: plan.model,
        mainColor: plan.mainColor,
        hairColor: plan.hairColor,
        accessory: plan.accessory,
        complexity: plan.complexity,
      };
      const next = plan.variants.map((variant, index) => ({
        id: `${Date.now()}-ai-${index}`,
        image: applyDrawCommands(
          generateSkin(
            {
              ...nextOptions,
              prompt: variant.prompt,
              style: variant.style,
              mainColor: variant.mainColor,
              hairColor: variant.hairColor,
              accessory: variant.accessory,
              complexity: variant.complexity,
            },
            index,
          ),
          variant.drawCommands,
        ),
      }));
      setCandidates(next);
      setSelected(cloneImageData(next[0].image));
      setOptions(nextOptions);
      setHistory([]);
      setRedoStack([]);
      setGenerationStatus("AI 已生成 4 个皮肤方案");
    } catch (error) {
      const next = [0, 1, 2, 3].map((variant) => ({
        id: `${Date.now()}-local-${variant}`,
        image: generateSkin(options, variant),
      }));
      setCandidates(next);
      setSelected(cloneImageData(next[0].image));
      setHistory([]);
      setRedoStack([]);
      setGenerationStatus(`AI 调用失败，已使用本地生成：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsGenerating(false);
    }
  }

  generateRef.current = () => {
    void generate();
  };

  function commit(next: ImageData) {
    setHistory((items) => [...items.slice(-24), cloneImageData(selected)]);
    setRedoStack([]);
    setSelected(next);
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setRedoStack((items) => [cloneImageData(selected), ...items]);
    setHistory((items) => items.slice(0, -1));
    setSelected(previous);
  }

  function redo() {
    const next = redoStack[0];
    if (!next) return;
    setHistory((items) => [...items, cloneImageData(selected)]);
    setRedoStack((items) => items.slice(1));
    setSelected(next);
  }

  function drawAt(x: number, y: number) {
    if (tool === "picker") {
      setColor(getPixelHex(selected, x, y));
      setTool("brush");
      return;
    }
    const alpha = tool === "eraser" ? 0 : 255;
    commit(setPixel(selected, x, y, color, alpha));
  }

  function resetCanvas() {
    commit(makeEmptySkin());
  }

  async function importSkin(file: File | null) {
    if (!file) return;
    const next = await readSkinFile(file);
    commit(next);
  }

  useEffect(() => {
    const button = generateButtonRef.current;
    if (!button) return;
    const handleClick = () => {
      generateRef.current();
    };
    button.addEventListener("click", handleClick);
    return () => {
      button.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <div className="brand">MCAISD</div>
          <h1>AI Minecraft 皮肤设计器</h1>
        </div>
        <div className="topbar-actions">
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            accept="image/png"
            onChange={(event) => {
              void importSkin(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <md-filled-tonal-button onClick={() => importInputRef.current?.click()}>
            <Import size={18} />
            导入 PNG
          </md-filled-tonal-button>
          <md-filled-tonal-button onClick={resetCanvas} title="清空画布">
            <RotateCcw size={18} />
            清空
          </md-filled-tonal-button>
          <md-filled-button onClick={() => exportSkin(selected, `mcaisd-skin-${Date.now()}.png`)}>
            <Download size={18} />
            导出 PNG
          </md-filled-button>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel generator-panel">
          <div className="panel-heading">
            <Sparkles size={18} />
            <span>生成</span>
          </div>

          <md-outlined-text-field
            ref={promptFieldRef}
            className="material-field prompt-field"
            label="角色描述"
            rows={5}
            type="textarea"
            value={options.prompt}
            onInput={(event) => updateOption("prompt", (event.currentTarget as HTMLElement & { value: string }).value)}
          />

          <div className="example-list">
            {examples.map((example) => (
              <button key={example} type="button" onClick={() => updateOption("prompt", example)}>
                {example}
              </button>
            ))}
          </div>

          <label className="field">
            <span>风格</span>
            <div className="segmented">
              {styles.map((item) => (
                <md-filter-chip
                  key={item.value}
                  selected={options.style === item.value}
                  label={item.label}
                  onClick={() => updateOption("style", item.value)}
                />
              ))}
            </div>
          </label>

          <div className="split-fields">
            <label className="field">
              <md-outlined-select
                ref={modelSelectRef}
                className="material-field"
                label="角色模型"
                value={options.model}
                onInput={(event) => updateOption("model", (event.currentTarget as HTMLElement & { value: SkinModel }).value)}
              >
                <md-select-option value="steve" selected={options.model === "steve"}>
                  <div slot="headline">Steve</div>
                </md-select-option>
                <md-select-option value="alex" selected={options.model === "alex"}>
                  <div slot="headline">Alex</div>
                </md-select-option>
              </md-outlined-select>
            </label>
            <label className="field">
              <md-outlined-select
                ref={accessorySelectRef}
                className="material-field"
                label="配饰"
                value={options.accessory}
                onInput={(event) => updateOption("accessory", (event.currentTarget as HTMLElement & { value: string }).value)}
              >
                {accessories.map((item) => (
                  <md-select-option key={item} value={item} selected={options.accessory === item}>
                    <div slot="headline">{item}</div>
                  </md-select-option>
                ))}
              </md-outlined-select>
            </label>
          </div>

          <div className="color-row">
            <label>
              <span>主色</span>
              <input type="color" value={options.mainColor} onChange={(event) => updateOption("mainColor", event.target.value)} />
            </label>
            <label>
              <span>发色</span>
              <input type="color" value={options.hairColor} onChange={(event) => updateOption("hairColor", event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>细节复杂度 {options.complexity}</span>
            <md-slider
              ref={complexitySliderRef}
              min={1}
              max={9}
              step={1}
              ticks
              labeled
              value={options.complexity}
              onInput={(event) => updateOption("complexity", Number((event.currentTarget as HTMLElement & { value: number }).value))}
            />
          </label>

          <md-filled-button ref={generateButtonRef} className="generate-button" disabled={isGenerating}>
            <Sparkles size={18} />
            {isGenerating ? "生成中" : "生成 4 个候选"}
          </md-filled-button>
          <div className="generation-status">{generationStatus}</div>

          <div className="candidate-grid">
            {candidates.map((candidate, index) => (
              <CandidateButton
                key={candidate.id}
                candidate={candidate}
                index={index}
                onPick={() => {
                  commit(cloneImageData(candidate.image));
                }}
              />
            ))}
          </div>
        </aside>

        <section className="preview-stage">
          <div className="stage-toolbar">
            <div className="panel-heading">
              <ImageIcon size={18} />
              <span>实时预览</span>
            </div>
            <md-filled-tonal-button onClick={() => setShowOuterLayer((value) => !value)}>
              {showOuterLayer ? <Eye size={17} /> : <EyeOff size={17} />}
              外层
            </md-filled-tonal-button>
          </div>
          <div className="model-area">
            <SkinModelPreview textureUrl={textureUrl} model={options.model} showOuterLayer={showOuterLayer} />
          </div>
        </section>

        <aside className="panel editor-panel">
          <div className="panel-heading">
            <Brush size={18} />
            <span>像素编辑</span>
          </div>

          <div className="tool-grid">
            <md-filled-icon-button selected={tool === "brush"} onClick={() => setTool("brush")} title="画笔">
              <Brush size={18} />
            </md-filled-icon-button>
            <md-filled-icon-button selected={tool === "eraser"} onClick={() => setTool("eraser")} title="橡皮">
              <Eraser size={18} />
            </md-filled-icon-button>
            <md-filled-icon-button selected={tool === "picker"} onClick={() => setTool("picker")} title="吸色">
              <Pipette size={18} />
            </md-filled-icon-button>
            <md-icon-button onClick={undo} disabled={history.length === 0} title="撤销">
              <Undo2 size={18} />
            </md-icon-button>
            <md-icon-button onClick={redo} disabled={redoStack.length === 0} title="重做">
              <Redo2 size={18} />
            </md-icon-button>
            <md-icon-button onClick={() => setShowGrid((value) => !value)} title="网格">
              <History size={18} />
            </md-icon-button>
          </div>

          <div className="active-color">
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            <span>{color.toUpperCase()}</span>
          </div>

          <SkinCanvas image={selected} showGrid={showGrid} onPixel={drawAt} />

          <div className="editor-meta">
            <span>64x64 PNG</span>
            <span>{history.length} 步历史</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

async function readSkinFile(file: File): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("无法读取图片"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(image, 0, 0, 64, 64);
    return ctx.getImageData(0, 0, 64, 64);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function CandidateButton({ candidate, index, onPick }: { candidate: Candidate; index: number; onPick: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) drawImageDataToCanvas(canvasRef.current, candidate.image, 2);
  }, [candidate.image]);

  return (
    <button className="candidate-button" type="button" onClick={onPick}>
      <canvas ref={canvasRef} width={128} height={128} />
      <span>方案 {index + 1}</span>
    </button>
  );
}

function SkinCanvas({ image, showGrid, onPixel }: { image: ImageData; showGrid: boolean; onPixel: (x: number, y: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPainting = useRef(false);

  useEffect(() => {
    if (canvasRef.current) drawImageDataToCanvas(canvasRef.current, image, 6);
  }, [image]);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * 64),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * 64),
    };
  }

  return (
    <div className={showGrid ? "skin-canvas-wrap grid-on" : "skin-canvas-wrap"}>
      <canvas
        ref={canvasRef}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          isPainting.current = true;
          const point = getPoint(event);
          onPixel(point.x, point.y);
        }}
        onPointerMove={(event) => {
          if (!isPainting.current) return;
          const point = getPoint(event);
          onPixel(point.x, point.y);
        }}
        onPointerUp={() => {
          isPainting.current = false;
        }}
        onPointerLeave={() => {
          isPainting.current = false;
        }}
      />
    </div>
  );
}

function SkinModelPreview({ textureUrl, model, showOuterLayer }: { textureUrl: string; model: SkinModel; showOuterLayer: boolean }) {
  return (
    <Canvas camera={{ position: [0, 1.55, 6.4], fov: 36 }} gl={{ antialias: false }}>
      <color attach="background" args={["#f7f8fb"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 4]} intensity={1.35} />
      <group position={[0, -0.8, 0]}>
        <MinecraftCharacter textureUrl={textureUrl} model={model} showOuterLayer={showOuterLayer} />
      </group>
      <OrbitControls enablePan={false} minDistance={4.6} maxDistance={8} target={[0, 0.75, 0]} />
    </Canvas>
  );
}

function MinecraftCharacter({ textureUrl, model, showOuterLayer }: { textureUrl: string; model: SkinModel; showOuterLayer: boolean }) {
  const texture = useLoader(THREE.TextureLoader, textureUrl);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  const armWidth = model === "alex" ? 0.35 : 0.45;
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.8 }), [texture]);
  const outerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: showOuterLayer ? 0.82 : 0,
        roughness: 0.75,
        depthWrite: false,
      }),
    [texture, showOuterLayer],
  );

  return (
    <group>
      <MappedBox position={[0, 2.35, 0]} scale={[0.9, 0.9, 0.9]} faces={UV.head} material={material} />
      <MappedBox position={[0, 2.35, 0]} scale={[1.02, 1.02, 1.02]} faces={UV.headOuter} material={outerMaterial} />
      <MappedBox position={[0, 1.25, 0]} scale={[0.9, 1.25, 0.48]} faces={UV.body} material={material} />
      <MappedBox position={[0, 1.25, 0]} scale={[0.98, 1.33, 0.54]} faces={UV.bodyOuter} material={outerMaterial} />
      <MappedBox position={[-0.68, 1.25, 0]} scale={[armWidth, 1.25, 0.45]} faces={UV.rightArm} material={material} />
      <MappedBox position={[0.68, 1.25, 0]} scale={[armWidth, 1.25, 0.45]} faces={UV.leftArm} material={material} />
      <MappedBox position={[-0.68, 1.25, 0]} scale={[armWidth + 0.05, 1.32, 0.5]} faces={UV.rightArmOuter} material={outerMaterial} />
      <MappedBox position={[0.68, 1.25, 0]} scale={[armWidth + 0.05, 1.32, 0.5]} faces={UV.leftArmOuter} material={outerMaterial} />
      <MappedBox position={[-0.24, 0.05, 0]} scale={[0.43, 1.25, 0.45]} faces={UV.rightLeg} material={material} />
      <MappedBox position={[0.24, 0.05, 0]} scale={[0.43, 1.25, 0.45]} faces={UV.leftLeg} material={material} />
      <MappedBox position={[-0.24, 0.05, 0]} scale={[0.48, 1.32, 0.5]} faces={UV.rightLegOuter} material={outerMaterial} />
      <MappedBox position={[0.24, 0.05, 0]} scale={[0.48, 1.32, 0.5]} faces={UV.leftLegOuter} material={outerMaterial} />
    </group>
  );
}

type FaceName = "front" | "back" | "left" | "right" | "top" | "bottom";
type FaceRects = Record<FaceName, [number, number, number, number]>;

const UV: Record<string, FaceRects> = {
  head: {
    top: [8, 0, 8, 8],
    bottom: [16, 0, 8, 8],
    right: [0, 8, 8, 8],
    front: [8, 8, 8, 8],
    left: [16, 8, 8, 8],
    back: [24, 8, 8, 8],
  },
  headOuter: {
    top: [40, 0, 8, 8],
    bottom: [48, 0, 8, 8],
    right: [32, 8, 8, 8],
    front: [40, 8, 8, 8],
    left: [48, 8, 8, 8],
    back: [56, 8, 8, 8],
  },
  body: {
    top: [20, 16, 8, 4],
    bottom: [28, 16, 8, 4],
    right: [16, 20, 4, 12],
    front: [20, 20, 8, 12],
    left: [28, 20, 4, 12],
    back: [32, 20, 8, 12],
  },
  bodyOuter: {
    top: [20, 32, 8, 4],
    bottom: [28, 32, 8, 4],
    right: [16, 36, 4, 12],
    front: [20, 36, 8, 12],
    left: [28, 36, 4, 12],
    back: [32, 36, 8, 12],
  },
  rightArm: {
    top: [44, 16, 4, 4],
    bottom: [48, 16, 4, 4],
    right: [40, 20, 4, 12],
    front: [44, 20, 4, 12],
    left: [48, 20, 4, 12],
    back: [52, 20, 4, 12],
  },
  rightArmOuter: {
    top: [44, 32, 4, 4],
    bottom: [48, 32, 4, 4],
    right: [40, 36, 4, 12],
    front: [44, 36, 4, 12],
    left: [48, 36, 4, 12],
    back: [52, 36, 4, 12],
  },
  leftArm: {
    top: [36, 48, 4, 4],
    bottom: [40, 48, 4, 4],
    right: [32, 52, 4, 12],
    front: [36, 52, 4, 12],
    left: [40, 52, 4, 12],
    back: [44, 52, 4, 12],
  },
  leftArmOuter: {
    top: [52, 48, 4, 4],
    bottom: [56, 48, 4, 4],
    right: [48, 52, 4, 12],
    front: [52, 52, 4, 12],
    left: [56, 52, 4, 12],
    back: [60, 52, 4, 12],
  },
  rightLeg: {
    top: [4, 16, 4, 4],
    bottom: [8, 16, 4, 4],
    right: [0, 20, 4, 12],
    front: [4, 20, 4, 12],
    left: [8, 20, 4, 12],
    back: [12, 20, 4, 12],
  },
  rightLegOuter: {
    top: [4, 32, 4, 4],
    bottom: [8, 32, 4, 4],
    right: [0, 36, 4, 12],
    front: [4, 36, 4, 12],
    left: [8, 36, 4, 12],
    back: [12, 36, 4, 12],
  },
  leftLeg: {
    top: [20, 48, 4, 4],
    bottom: [24, 48, 4, 4],
    right: [16, 52, 4, 12],
    front: [20, 52, 4, 12],
    left: [24, 52, 4, 12],
    back: [28, 52, 4, 12],
  },
  leftLegOuter: {
    top: [4, 48, 4, 4],
    bottom: [8, 48, 4, 4],
    right: [0, 52, 4, 12],
    front: [4, 52, 4, 12],
    left: [8, 52, 4, 12],
    back: [12, 52, 4, 12],
  },
};

function MappedBox({
  position,
  scale,
  material,
  faces,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  material: THREE.Material;
  faces: FaceRects;
}) {
  const geometry = useMemo(() => makeMappedBoxGeometry(faces), [faces]);
  return (
    <mesh position={position} scale={scale} material={material}>
      <primitive object={geometry} attach="geometry" />
    </mesh>
  );
}

function makeMappedBoxGeometry(faces: FaceRects): THREE.BufferGeometry {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const addFace = (name: FaceName, points: Array<[number, number, number]>) => {
    const base = vertices.length / 3;
    points.forEach((point) => vertices.push(...point));
    rectToUv(faces[name]).forEach((uv) => uvs.push(...uv));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  addFace("front", [
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
  ]);
  addFace("back", [
    [0.5, -0.5, -0.5],
    [-0.5, -0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [0.5, 0.5, -0.5],
  ]);
  addFace("left", [
    [-0.5, -0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [-0.5, 0.5, 0.5],
    [-0.5, 0.5, -0.5],
  ]);
  addFace("right", [
    [0.5, -0.5, 0.5],
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [0.5, 0.5, 0.5],
  ]);
  addFace("top", [
    [-0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
  ]);
  addFace("bottom", [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, -0.5, 0.5],
    [-0.5, -0.5, 0.5],
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function rectToUv([x, y, w, h]: [number, number, number, number]): Array<[number, number]> {
  const inset = 0.001;
  const u0 = (x + inset) / 64;
  const u1 = (x + w - inset) / 64;
  const v0 = 1 - (y + h - inset) / 64;
  const v1 = 1 - (y + inset) / 64;
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
}
