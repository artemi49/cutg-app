import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_TRANSFORM,
  MAX_SCALE,
  MIN_SCALE,
  PANEL_FRACTION,
  drawBlueprint,
  ensureFonts,
  loadImage,
  saveImage,
  saveImages,
} from "./blueprint";
import type { ImageTransform } from "./blueprint";
import { DEFAULT_TEXTS, HAIRCUT_GROUPS } from "./constants";
import type { BlueprintConfig, Language } from "./types";
import LegacyStudio from "./LegacyStudio";

type Mode = "t1" | "t2";
type Slot = "before" | "after";
type JobStatus = "pending" | "active" | "done" | "error";
interface Job {
  name: string;
  status: JobStatus;
}

const STUDIO_ROUTE = "#studio";
const STUDIO_PASSWORD = "!Yarak123";

const ALL_STYLES = HAIRCUT_GROUPS.flatMap((g) => g.cuts);

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

function gptPrompt(name: string, details: string): string {
  return `Give this person a ${name} haircut. ${details}. Change only the hair — keep the exact same face, identity, skin tone, expression and background. Photorealistic, natural salon result.`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Verkleinert das Bild auf max. maxDim px (JPEG) fürs Hochladen zur API. */
function imageToApiDataUrl(img: HTMLImageElement, maxDim = 1024): string {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function requestAfter(
  imageDataUrl: string,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/generate-after", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, prompt }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Generation failed");
  return data.image as string;
}

function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

function safeName(name: string) {
  return name.replace(/\s+/g, "-").toLowerCase();
}

interface T1Item {
  id: number;
  src: string;
  img: HTMLImageElement;
  style: string;
}

interface TemplateResult {
  name: string;
  before: HTMLImageElement;
  after: HTMLImageElement;
}

interface AfterResult {
  name: string;
  dataUrl: string;
}

interface EditorHandle {
  save: () => void;
  getResult: () => { dataUrl: string; filename: string } | null;
}

function MainApp() {
  const [mode, setMode] = useState<Mode>("t1");
  const [brandName, setBrandName] = useState("CutG");
  const [showBranding, setShowBranding] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef(false);

  const [t1, setT1] = useState<T1Item[]>([]);
  const [t1Results, setT1Results] = useState<TemplateResult[]>([]);

  const [t2, setT2] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [t2Styles, setT2Styles] = useState<string[]>([]);
  const [t2Result, setT2Result] = useState<{
    beforeAfter: TemplateResult | null;
    afters: AfterResult[];
  } | null>(null);

  const idRef = useRef(0);
  const t1EditorRefs = useRef<(EditorHandle | null)[]>([]);

  useEffect(() => {
    ensureFonts();
  }, []);

  const config: BlueprintConfig = useMemo(
    () => ({
      language: "en" as Language,
      texts: DEFAULT_TEXTS.en,
      accentColor: "#0a0a0a",
      showBranding,
      brandName,
    }),
    [showBranding, brandName]
  );

  // ---- Template 1 ----
  const addT1Files = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const room = 5 - t1.length;
    for (const file of Array.from(files).slice(0, room)) {
      const src = await readFileAsDataUrl(file);
      const img = await loadImage(src);
      const id = ++idRef.current;
      setT1((prev) => (prev.length >= 5 ? prev : [...prev, { id, src, img, style: "" }]));
    }
  };

  const setT1Style = (id: number, style: string) =>
    setT1((prev) => prev.map((i) => (i.id === id ? { ...i, style } : i)));

  const removeT1 = (id: number) => setT1((prev) => prev.filter((i) => i.id !== id));

  const t1Ready = t1.length > 0 && t1.every((i) => i.style) && !isGenerating;

  const runT1 = async () => {
    if (!t1Ready) return;
    const controller = new AbortController();
    abortRef.current = controller;
    cancelRef.current = false;
    setIsGenerating(true);
    setError(null);
    setT1Results([]);
    t1EditorRefs.current = [];
    setJobs(t1.map((i) => ({ name: i.style, status: "pending" })));
    try {
      await ensureFonts();
      const results: TemplateResult[] = [];
      for (let i = 0; i < t1.length; i++) {
        if (cancelRef.current) break;
        setJobs((prev) => prev.map((j, k) => (k === i ? { ...j, status: "active" } : j)));
        const item = t1[i];
        const style = ALL_STYLES.find((s) => s.name === item.style)!;
        const afterUrl = await requestAfter(
          imageToApiDataUrl(item.img),
          gptPrompt(style.name, style.details),
          controller.signal
        );
        const afterImg = await loadImage(afterUrl);
        results.push({ name: style.name, before: item.img, after: afterImg });
        setT1Results([...results]);
        setJobs((prev) => prev.map((j, k) => (k === i ? { ...j, status: "done" } : j)));
      }
    } catch (err) {
      if (!isAbort(err) && !cancelRef.current) {
        setError(err instanceof Error ? err.message : "Generation failed");
        setJobs((prev) =>
          prev.map((j) => (j.status === "active" ? { ...j, status: "error" } : j))
        );
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  // ---- Template 2 ----
  const setT2File = async (file: File | null) => {
    setError(null);
    setT2Result(null);
    if (!file) {
      setT2(null);
      return;
    }
    const src = await readFileAsDataUrl(file);
    const img = await loadImage(src);
    setT2({ src, img });
  };

  const toggleT2Style = (name: string) =>
    setT2Styles((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );

  const t2Ready = !!t2 && t2Styles.length > 0 && !isGenerating;

  const runT2 = async () => {
    if (!t2Ready || !t2) return;
    const controller = new AbortController();
    abortRef.current = controller;
    cancelRef.current = false;
    setIsGenerating(true);
    setError(null);
    setT2Result(null);
    setJobs(t2Styles.map((name) => ({ name, status: "pending" })));
    try {
      await ensureFonts();
      let beforeAfter: TemplateResult | null = null;
      const afters: AfterResult[] = [];
      for (let i = 0; i < t2Styles.length; i++) {
        if (cancelRef.current) break;
        setJobs((prev) => prev.map((j, k) => (k === i ? { ...j, status: "active" } : j)));
        const style = ALL_STYLES.find((s) => s.name === t2Styles[i])!;
        const afterUrl = await requestAfter(
          imageToApiDataUrl(t2.img),
          gptPrompt(style.name, style.details),
          controller.signal
        );
        if (i === 0) {
          const afterImg = await loadImage(afterUrl);
          beforeAfter = { name: style.name, before: t2.img, after: afterImg };
        } else {
          afters.push({ name: style.name, dataUrl: afterUrl });
        }
        setT2Result({ beforeAfter, afters: [...afters] });
        setJobs((prev) => prev.map((j, k) => (k === i ? { ...j, status: "done" } : j)));
      }
    } catch (err) {
      if (!isAbort(err) && !cancelRef.current) {
        setError(err instanceof Error ? err.message : "Generation failed");
        setJobs((prev) =>
          prev.map((j) => (j.status === "active" ? { ...j, status: "error" } : j))
        );
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const cancelGeneration = () => {
    cancelRef.current = true;
    abortRef.current?.abort();
  };

  const downloadAllAfters = (results: AfterResult[]) =>
    saveImages(
      results.map((r, i) => ({
        dataUrl: r.dataUrl,
        filename: `cutg-after-${safeName(r.name)}-${i + 1}.png`,
      }))
    );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-paper-border bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="logo-mark">✂</div>
            <div>
              <h1 className="brand-text text-xl">CutG</h1>
              <p className="mt-0.5 text-sm text-ink-muted">before · after · generator</p>
            </div>
          </div>
          <span className="rounded-full border border-paper-border bg-white px-4 py-1.5 text-xs font-medium tracking-widest text-ink-muted">
            {CANVAS_WIDTH} × {CANVAS_HEIGHT} · 3:4
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-8">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("t1")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              mode === "t1"
                ? "border-ink bg-ink text-white"
                : "border-paper-border bg-white text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            Template 1
            <span className="mt-0.5 block text-xs font-normal opacity-70">
              up to 5 images · one style each
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("t2")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              mode === "t2"
                ? "border-ink bg-ink text-white"
                : "border-paper-border bg-white text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            Template 2
            <span className="mt-0.5 block text-xs font-normal opacity-70">
              one image · many styles
            </span>
          </button>
        </div>

        <section className="panel flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-faint">Brand</label>
            <input
              className="input-field w-40 py-2"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showBranding}
              onChange={(e) => setShowBranding(e.target.checked)}
              className="h-4 w-4 rounded border-paper-border accent-ink"
            />
            <span className="text-sm text-ink-muted">Show branding</span>
          </label>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {mode === "t1" ? (
          <section className="space-y-6">
            <div className="panel p-6">
              <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                1 · Add images ({t1.length}/5) & pick a hairstyle for each
              </h2>

              <div className="mt-4 space-y-3">
                {t1.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 rounded-xl border border-paper-border bg-paper-warm p-3"
                  >
                    <img
                      src={item.src}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                    <select
                      className="input-field flex-1 py-2"
                      value={item.style}
                      onChange={(e) => setT1Style(item.id, e.target.value)}
                    >
                      <option value="">Choose hairstyle…</option>
                      {HAIRCUT_GROUPS.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.cuts.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-ink-faint hover:text-ink hover:underline"
                      onClick={() => removeT1(item.id)}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>

              {t1.length < 5 && (
                <label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-paper-border bg-paper-warm px-4 py-6 text-center text-sm font-medium text-ink transition hover:border-ink hover:bg-white">
                  + Add image{t1.length > 0 ? "s" : ""}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => addT1Files(e.target.files)}
                  />
                </label>
              )}
            </div>

            {jobs.length > 0 && <ProgressTracker jobs={jobs} />}
            {isGenerating ? (
              <button
                type="button"
                className="w-full rounded-full border border-red-300 bg-white py-4 text-sm font-medium uppercase tracking-widest text-red-600 transition hover:bg-red-50"
                onClick={cancelGeneration}
              >
                Cancel generation
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary w-full py-4 text-sm uppercase tracking-widest"
                disabled={!t1Ready}
                onClick={runT1}
              >
                {`Generate ${t1.length || ""} before/after template${
                  t1.length === 1 ? "" : "s"
                }`}
              </button>
            )}

            {t1Results.length > 0 && (
              <div className="panel p-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                    Results ({t1Results.length})
                  </h2>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() =>
                      saveImages(
                        t1EditorRefs.current
                          .map((r) => r?.getResult())
                          .filter((x): x is { dataUrl: string; filename: string } => !!x)
                      )
                    }
                  >
                    Save all
                  </button>
                </div>
                <p className="mb-4 text-xs text-ink-faint">
                  Drag inside a template to reposition · sliders to zoom.
                </p>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {t1Results.map((r, i) => (
                    <TemplateEditor
                      key={i}
                      ref={(el) => (t1EditorRefs.current[i] = el)}
                      before={r.before}
                      after={r.after}
                      config={config}
                      name={r.name}
                      prefix="t1"
                      index={i}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-6">
            <div className="panel p-6">
              <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                1 · Add one image
              </h2>
              <div className="mt-4">
                {t2 ? (
                  <div className="flex items-center gap-4">
                    <img src={t2.src} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <button
                      type="button"
                      className="text-xs text-ink-faint hover:text-ink hover:underline"
                      onClick={() => setT2File(null)}
                    >
                      remove
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-paper-border bg-paper-warm px-4 py-8 text-center text-sm font-medium text-ink transition hover:border-ink hover:bg-white">
                    + Add image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => setT2File(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="panel p-6">
              <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                2 · Pick hairstyles ({t2Styles.length} selected)
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                First style → editable before/after template · the rest → single after images.
              </p>
              <div className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-1">
                {HAIRCUT_GROUPS.map((group) => (
                  <div key={group.group}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      {group.group}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.cuts.map((cut) => {
                        const idx = t2Styles.indexOf(cut.name);
                        return (
                          <button
                            key={cut.name}
                            type="button"
                            title={cut.details}
                            onClick={() => toggleT2Style(cut.name)}
                            className={`chip ${idx >= 0 ? "chip-active" : ""}`}
                          >
                            {idx >= 0 ? `${idx + 1} · ${cut.name}` : cut.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {jobs.length > 0 && <ProgressTracker jobs={jobs} />}
            {isGenerating ? (
              <button
                type="button"
                className="w-full rounded-full border border-red-300 bg-white py-4 text-sm font-medium uppercase tracking-widest text-red-600 transition hover:bg-red-50"
                onClick={cancelGeneration}
              >
                Cancel generation
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary w-full py-4 text-sm uppercase tracking-widest"
                disabled={!t2Ready}
                onClick={runT2}
              >
                {`Generate (${t2Styles.length || 0} image${
                  t2Styles.length === 1 ? "" : "s"
                })`}
              </button>
            )}

            {t2Result && (
              <div className="space-y-6">
                {t2Result.beforeAfter && (
                  <div className="panel p-6">
                    <h2 className="mb-1 text-xs font-medium uppercase tracking-widest text-ink-faint">
                      Before / after template
                    </h2>
                    <p className="mb-4 text-xs text-ink-faint">
                      Drag inside the template to reposition · sliders to zoom.
                    </p>
                    <div className="max-w-sm">
                      <TemplateEditor
                        before={t2Result.beforeAfter.before}
                        after={t2Result.beforeAfter.after}
                        config={config}
                        name={t2Result.beforeAfter.name}
                        prefix="t2"
                        index={0}
                      />
                    </div>
                  </div>
                )}
                {t2Result.afters.length > 0 && (
                  <div className="panel p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                        After images ({t2Result.afters.length})
                      </h2>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => downloadAllAfters(t2Result.afters)}
                      >
                        Save all
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {t2Result.afters.map((r, i) => (
                        <AfterCard key={i} result={r} index={i} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <p className="text-center text-xs text-ink-faint">
          Each generation is a paid GPT-Image 2 call. Faces are generated by AI.
        </p>
      </main>

      <footer className="mt-auto border-t border-paper-border bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
              ✂
            </div>
            <span className="brand-text text-sm">CutG</span>
          </div>
          <p className="text-xs text-ink-faint">
            © {new Date().getFullYear()} CutG · runs entirely in your browser
          </p>
        </div>
      </footer>
    </div>
  );
}

const TemplateEditor = forwardRef<
  EditorHandle,
  {
    before: HTMLImageElement;
    after: HTMLImageElement;
    config: BlueprintConfig;
    name: string;
    prefix: string;
    index: number;
  }
>(function TemplateEditor({ before, after, config, name, prefix, index }, ref) {
  const [transforms, setTransforms] = useState<{
    before: ImageTransform;
    after: ImageTransform;
  }>({ before: { ...DEFAULT_TRANSFORM }, after: { ...DEFAULT_TRANSFORM } });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ slot: Slot; lastX: number; lastY: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawBlueprint(canvas, before, after, config, transforms);
  }, [before, after, config, transforms]);

  const filename = `cutg-${prefix}-${safeName(name)}-${index + 1}.png`;
  const getResult = () => {
    const canvas = canvasRef.current;
    return canvas ? { dataUrl: canvas.toDataURL("image/png"), filename } : null;
  };
  const save = () => {
    const r = getResult();
    if (r) saveImage(r.dataUrl, r.filename);
  };

  useImperativeHandle(ref, () => ({ save, getResult }));

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    const slot: Slot = relY < PANEL_FRACTION ? "before" : "after";
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { slot, lastX: e.clientX, lastY: e.clientY };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    const panelH = rect.height * PANEL_FRACTION;
    setTransforms((t) => {
      const cur = t[drag.slot];
      return {
        ...t,
        [drag.slot]: {
          ...cur,
          offsetY: clamp(cur.offsetY + (dy / panelH) * 2, -1, 1),
          offsetX: clamp(cur.offsetX - (dx / rect.width) * 2, -1, 1),
        },
      };
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current && canvasRef.current) {
      try {
        canvasRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null;
  };

  const patch = (slot: Slot, p: Partial<ImageTransform>) =>
    setTransforms((t) => ({ ...t, [slot]: { ...t[slot], ...p } }));
  const reset = (slot: Slot) =>
    setTransforms((t) => ({ ...t, [slot]: { ...DEFAULT_TRANSFORM } }));

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="block w-full cursor-grab touch-none rounded-lg border border-paper-border active:cursor-grabbing"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-ink">{name}</span>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-ink underline underline-offset-2"
          onClick={save}
        >
          Save
        </button>
      </div>
      <div className="space-y-1.5">
        {(["before", "after"] as const).map((slot) => (
          <div key={slot} className="flex items-center gap-2">
            <span className="w-10 text-[10px] uppercase tracking-wider text-ink-faint">
              {slot}
            </span>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.01}
              value={transforms[slot].scale}
              onChange={(e) => patch(slot, { scale: Number(e.target.value) })}
              className="h-1 flex-1 cursor-pointer accent-ink"
            />
            <button
              type="button"
              className="shrink-0 text-[10px] text-ink-faint hover:text-ink"
              onClick={() => reset(slot)}
            >
              reset
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});

function ProgressTracker({ jobs }: { jobs: Job[] }) {
  const done = jobs.filter((j) => j.status === "done").length;
  const pct = jobs.length ? (done / jobs.length) * 100 : 0;
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-widest text-ink-faint">
          Progress
        </span>
        <span className="text-ink-muted">
          {done}/{jobs.length}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-warm">
        <div
          className="h-full rounded-full bg-ink transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1.5">
        {jobs.map((j, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            {j.status === "done" ? (
              <span className="text-ink">✓</span>
            ) : j.status === "active" ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-paper-border border-t-ink" />
            ) : j.status === "error" ? (
              <span className="text-red-600">✕</span>
            ) : (
              <span className="text-ink-faint">○</span>
            )}
            <span className={j.status === "pending" ? "text-ink-faint" : "text-ink"}>
              {j.name}
            </span>
            {j.status === "active" && (
              <span className="text-ink-faint">generating…</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AfterCard({ result, index }: { result: AfterResult; index: number }) {
  return (
    <div className="space-y-2">
      <img
        src={result.dataUrl}
        alt={result.name}
        className="w-full rounded-lg border border-paper-border"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-ink-muted">{result.name}</span>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-ink underline underline-offset-2"
          onClick={() =>
            saveImage(
              result.dataUrl,
              `cutg-after-${safeName(result.name)}-${index + 1}.png`
            )
          }
        >
          Save
        </button>
      </div>
    </div>
  );
}

function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem("cutg_studio") === "1"
  );
  const [pw, setPw] = useState("");
  const [wrong, setWrong] = useState(false);

  if (authed) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === STUDIO_PASSWORD) {
      sessionStorage.setItem("cutg_studio", "1");
      setAuthed(true);
    } else {
      setWrong(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="logo-mark">✂</div>
          <div>
            <h1 className="brand-text text-lg">CutG Studio</h1>
            <p className="text-xs text-ink-muted">private · password required</p>
          </div>
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setWrong(false);
          }}
          className="input-field"
          placeholder="Password"
        />
        {wrong && <p className="mt-2 text-xs text-red-600">Wrong password.</p>}
        <button type="submit" className="btn-primary mt-4 w-full py-3">
          Unlock
        </button>
        <a
          href="#"
          className="mt-3 block text-center text-xs text-ink-faint hover:text-ink"
        >
          ← back to generator
        </a>
      </form>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route === STUDIO_ROUTE)
    return (
      <PasswordGate>
        <MainApp />
      </PasswordGate>
    );
  return <LegacyStudio />;
}
