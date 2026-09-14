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
  saveImage as saveImageRaw,
  saveImages as saveImagesRaw,
} from "./blueprint";
import type { ImageTransform } from "./blueprint";
import {
  DEFAULT_TEXTS,
  GENDERS,
  HAIRCUT_GROUPS_BY_GENDER,
  SUBJECT,
  allStyles,
  findStyle,
} from "./constants";
import type {
  BlueprintConfig,
  Gender,
  HairStyle,
  HairstyleGroup,
  Language,
} from "./types";
import AdminPanel from "./Admin";
import LoginScreen from "./Login";
import MyHistory from "./MyHistory";
import VideoTemplate from "./VideoTemplate";
import VideoTemplate4 from "./VideoTemplate4";
import { logEvent, rpc, signOut, useSession, type Profile } from "./session";

type Mode = "t1" | "t2" | "t3" | "t4";
type Slot = "before" | "after";
type JobStatus = "pending" | "active" | "done" | "error";
interface Job {
  name: string;
  status: JobStatus;
}

const GENDER_STORAGE_KEY = "cutg_gender";

/** Downloads landen im Verlauf – der Admin sieht, wer wie viel rausgibt. */
function saveImage(dataUrl: string, filename: string) {
  logEvent("download", 1, { filename });
  saveImageRaw(dataUrl, filename);
}

function saveImages(items: { dataUrl: string; filename: string }[]) {
  if (!items.length) return;
  logEvent("download", items.length, { count: items.length });
  saveImagesRaw(items);
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** Frontal-Prompt: Schnitt ODER Farbe, passend zur Zielgruppe */
function gptPrompt(style: HairStyle, gender: Gender): string {
  const { noun, possessive, venue } = SUBJECT[gender];
  if (style.kind === "color") {
    return `Recolour the hair of this ${noun} to ${style.name}. ${style.details}. Keep ${possessive} exact haircut, hair length and styling — change only the hair colour. Keep the exact same face, identity, skin tone, expression and background. Photorealistic, natural ${venue} colour result.`;
  }
  return `Give this ${noun} a ${style.name} hairstyle. ${style.details}. Change only the hair — keep the exact same face, identity, skin tone, expression and background. Photorealistic, natural ${venue} result.`;
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

const JOB_STORAGE_KEY = "cutg_active_job";

interface ActiveJob {
  id: string;
  mode: Mode;
  gender: Gender;
  styles: string[];
}
interface JobState {
  id: string;
  status: string;
  done: number;
  total: number;
  items: { idx: number; style: string; status: string; error: string | null }[];
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

function MainApp({ profile, onReload }: { profile: Profile; onReload: () => void }) {
  const [mode, setMode] = useState<Mode>("t1");
  const [gender, setGender] = useState<Gender>(
    () => (localStorage.getItem(GENDER_STORAGE_KEY) as Gender) ?? "men"
  );
  const [brandName, setBrandName] = useState("CutG");
  const [showBranding, setShowBranding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [jobStatus, setJobStatus] = useState<JobState | null>(null);
  const loadedIdx = useRef<Set<number>>(new Set());

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
    const raw = localStorage.getItem(JOB_STORAGE_KEY);
    if (raw) {
      try {
        const job = JSON.parse(raw) as ActiveJob;
        setActiveJob(job);
        setMode(job.mode); // zurück auf den Tab des laufenden Auftrags
        if (job.gender) setGender(job.gender);
      } catch {
        localStorage.removeItem(JOB_STORAGE_KEY);
      }
    }
  }, []);

  const groups = HAIRCUT_GROUPS_BY_GENDER[gender];
  const styleCount = useMemo(() => allStyles(gender).length, [gender]);

  /** Zielgruppe wechseln: Auswahl zurücksetzen, da die Style-Namen andere sind */
  const changeGender = (next: Gender) => {
    if (next === gender) return;
    setGender(next);
    localStorage.setItem(GENDER_STORAGE_KEY, next);
    setT1((prev) => prev.map((i) => ({ ...i, style: "" })));
    setT2Styles([]);
  };

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

  const busy = !!activeJob && (!jobStatus || jobStatus.status !== "done");

  const jobs: Job[] = (jobStatus?.items ?? []).map((i) => ({
    name: i.style,
    status:
      i.status === "processing"
        ? "active"
        : i.status === "done"
          ? "done"
          : i.status === "error"
            ? "error"
            : "pending",
  }));

  // Aufräumen heißt nur noch: lokale Ansicht leeren. Der Verlauf im Server
  // bleibt bestehen – Clipper können nichts aus ihrer Historie entfernen.
  const clearJob = () => {
    const id = activeJob?.id;
    localStorage.removeItem(JOB_STORAGE_KEY);
    setActiveJob(null);
    setJobStatus(null);
    setT1Results([]);
    setT2Result(null);
    loadedIdx.current = new Set();
    t1EditorRefs.current = [];
    if (id) rpc("mkt_delete_job", { p_job: id }).catch(() => {});
  };

  const startJob = async (
    m: Mode,
    items: Record<string, unknown>[],
    styles: string[],
    sharedImage?: string
  ) => {
    setError(null);
    setT1Results([]);
    setT2Result(null);
    t1EditorRefs.current = [];
    loadedIdx.current = new Set();
    setJobStatus({
      id: "",
      status: "processing",
      done: 0,
      total: items.length,
      items: styles.map((s, i) => ({ idx: i, style: s, status: "pending", error: null })),
    });
    try {
      const body: Record<string, unknown> = { p_items: items, p_mode: m, p_gender: gender };
      if (sharedImage) body.p_shared_image = sharedImage;
      const jobId = await rpc<string>("mkt_create_job", body);
      const job: ActiveJob = { id: jobId, mode: m, gender, styles };
      localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify(job));
      setActiveJob(job);
      onReload(); // Verbrauchszähler im Kopf aktualisieren
    } catch (e) {
      setError(
        e instanceof Error && /load failed|networkerror|failed to fetch/i.test(e.message)
          ? "Could not reach the server — check your connection and try again."
          : e instanceof Error
            ? e.message
            : "Could not start the job."
      );
      setJobStatus(null);
    }
  };

  // Status pollen – läuft weiter, auch wenn man die Seite verlässt und zurückkommt
  useEffect(() => {
    if (!activeJob) return;
    let stop = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stop) return;
      try {
        const data = await rpc<JobState | null>("mkt_get_job", {
          p_job: activeJob.id,
        });
        if (stop) return;
        if (!data) {
          clearJob();
          return;
        }
        setJobStatus(data);
        if (data.status === "done") return;
      } catch {
        /* retry beim nächsten Tick */
      }
      timer = window.setTimeout(tick, 3000);
    };
    tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob]);

  // Fertige Elemente einmalig laden und rendern
  useEffect(() => {
    if (!activeJob || !jobStatus) return;
    (async () => {
      for (const it of jobStatus.items) {
        if (it.status !== "done" || loadedIdx.current.has(it.idx)) continue;
        loadedIdx.current.add(it.idx);
        try {
          const r = await rpc<{ image: string; result: string } | null>(
            "mkt_get_result",
            { p_job: activeJob.id, p_idx: it.idx }
          );
          if (!r || !r.result) continue;
          if (activeJob.mode === "t2" && it.idx > 0) {
            setT2Result((prev) => ({
              beforeAfter: prev?.beforeAfter ?? null,
              afters: [...(prev?.afters ?? []), { name: it.style, dataUrl: r.result }],
            }));
          } else {
            const before = await loadImage(r.image);
            const after = await loadImage(r.result);
            if (activeJob.mode === "t1") {
              setT1Results((prev) => [...prev, { name: it.style, before, after }]);
            } else {
              setT2Result((prev) => ({
                beforeAfter: { name: it.style, before, after },
                afters: prev?.afters ?? [],
              }));
            }
          }
        } catch {
          /* ignore */
        }
      }
    })();
  }, [jobStatus, activeJob]);

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

  const t1Ready = t1.length > 0 && t1.every((i) => i.style) && !busy;

  const runT1 = () => {
    if (!t1Ready) return;
    const items = t1.map((it, i) => {
      const s = findStyle(gender, it.style)!;
      return {
        idx: i,
        image: imageToApiDataUrl(it.img),
        style: it.style,
        prompt: gptPrompt(s, gender),
        size: "1024x1536",
      };
    });
    startJob(
      "t1",
      items,
      t1.map((i) => i.style)
    );
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

  const t2Ready = !!t2 && t2Styles.length > 0 && !busy;

  const runT2 = () => {
    if (!t2Ready || !t2) return;
    const img = imageToApiDataUrl(t2.img);
    // Bild NICHT pro Element mitschicken – einmal als sharedImage (kleiner Upload)
    const items = t2Styles.map((name, i) => {
      const s = findStyle(gender, name)!;
      return {
        idx: i,
        style: name,
        prompt: gptPrompt(s, gender),
        // erstes Bild = Vorher/Nachher-Template (hochkant), die anderen = 1:1
        size: i === 0 ? "1024x1536" : "1024x1024",
      };
    });
    startJob("t2", items, t2Styles, img);
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
              <h1 className="brand-text text-xl">CutG Studio</h1>
              <p className="mt-0.5 text-sm text-ink-muted">
                {CANVAS_WIDTH} × {CANVAS_HEIGHT} · 3:4
              </p>
            </div>
          </div>
          <AccountBar profile={profile} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-8">
        <GenderSwitch value={gender} onChange={changeGender} styleCount={styleCount} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          <button
            type="button"
            onClick={() => setMode("t3")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              mode === "t3"
                ? "border-ink bg-ink text-white"
                : "border-paper-border bg-white text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            Template 3
            <span className="mt-0.5 block text-xs font-normal opacity-70">
              recommendation video · no AI
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("t4")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              mode === "t4"
                ? "border-ink bg-ink text-white"
                : "border-paper-border bg-white text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            Template 4
            <span className="mt-0.5 block text-xs font-normal opacity-70">
              report scroll video · no AI
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
                      {groups.map((g) => (
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
            {busy && (
              <p className="text-center text-xs text-ink-faint">
                Runs in the background — you can close this page and come back later.
              </p>
            )}
            {busy ? (
              <button
                type="button"
                className="w-full rounded-full border border-red-300 bg-white py-4 text-sm font-medium uppercase tracking-widest text-red-600 transition hover:bg-red-50"
                onClick={clearJob}
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
        ) : mode === "t2" ? (
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
              <StylePicker
                groups={groups}
                gender={gender}
                selected={t2Styles}
                onToggle={toggleT2Style}
                onClear={() => setT2Styles([])}
              />
            </div>

            {jobs.length > 0 && <ProgressTracker jobs={jobs} />}
            {busy && (
              <p className="text-center text-xs text-ink-faint">
                Runs in the background — you can close this page and come back later.
              </p>
            )}
            {busy ? (
              <button
                type="button"
                className="w-full rounded-full border border-red-300 bg-white py-4 text-sm font-medium uppercase tracking-widest text-red-600 transition hover:bg-red-50"
                onClick={clearJob}
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
        ) : mode === "t3" ? (
          <VideoTemplate
            gender={gender}
            groups={groups}
            brandName={brandName}
            showBranding={showBranding}
          />
        ) : (
          <VideoTemplate4
            gender={gender}
            groups={groups}
            brandName={brandName}
            showBranding={showBranding}
          />
        )}

        <p className="text-center text-xs text-ink-faint">
          Every generation is a paid GPT-Image 2 call and is recorded against your
          account.
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
            © {new Date().getFullYear()} CutG · signed in as {profile.username}
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Nutzer-Chip im Kopf: Verbrauch, Verlauf, Admin-Link, Abmelden */
function AccountBar({ profile }: { profile: Profile }) {
  const limitText =
    profile.monthly_limit === null
      ? `${profile.used_this_month} this month`
      : `${profile.used_this_month} / ${profile.monthly_limit} this month`;
  const overLimit =
    profile.monthly_limit !== null && profile.used_this_month >= profile.monthly_limit;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`rounded-full border px-4 py-1.5 text-xs font-medium ${
          overLimit
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-paper-border bg-white text-ink-muted"
        }`}
        title={`${profile.used_total} generations in total`}
      >
        {profile.username} · {limitText}
      </span>
      <a href="#history" className="btn-secondary text-xs">
        My history
      </a>
      {profile.role === "admin" && (
        <a href="#admin" className="btn-secondary text-xs">
          Admin
        </a>
      )}
      <button type="button" className="btn-secondary text-xs" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}

/** Men / Women – gilt für beide Templates gleichermaßen */
function GenderSwitch({
  value,
  onChange,
  styleCount,
}: {
  value: Gender;
  onChange: (g: Gender) => void;
  styleCount: number;
}) {
  return (
    <section className="panel flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          Style library
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {styleCount} styles · applies to all templates
        </p>
      </div>
      <div className="flex rounded-full border border-paper-border bg-paper-warm p-1">
        {GENDERS.map((g) => (
          <button
            key={g.code}
            type="button"
            aria-pressed={value === g.code}
            onClick={() => onChange(g.code)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              value === g.code
                ? "bg-ink text-white shadow-chill"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <span aria-hidden>{g.icon}</span>
            {g.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Style-Auswahl mit Suche, Gruppen und Zähler (Template 2 & 3) */
function StylePicker({
  groups,
  gender,
  selected,
  onToggle,
  onClear,
}: {
  groups: HairstyleGroup[];
  gender: Gender;
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");

  // Suche zurücksetzen, wenn die Zielgruppe wechselt
  useEffect(() => setQuery(""), [gender]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          cuts: q
            ? g.cuts.filter(
                (c) =>
                  c.name.toLowerCase().includes(q) ||
                  c.details.toLowerCase().includes(q) ||
                  g.group.toLowerCase().includes(q)
              )
            : g.cuts,
        }))
        .filter((g) => g.cuts.length > 0),
    [groups, q]
  );

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <input
          className="input-field flex-1 py-2.5"
          placeholder="Search styles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {selected.length > 0 && (
          <button
            type="button"
            className="shrink-0 text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
            onClick={onClear}
          >
            clear ({selected.length})
          </button>
        )}
      </div>

      <div className="scroll-box mt-3 max-h-80 space-y-4 p-3">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            No style matches “{query}”.
          </p>
        ) : (
          visible.map((group) => (
            <div key={group.group}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {group.group}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.cuts.map((cut) => {
                  const idx = selected.indexOf(cut.name);
                  return (
                    <button
                      key={cut.name}
                      type="button"
                      title={cut.details}
                      onClick={() => onToggle(cut.name)}
                      className={`chip ${idx >= 0 ? "chip-active" : ""}`}
                    >
                      {cut.kind === "color" && <span aria-hidden>◐ </span>}
                      {idx >= 0 ? `${idx + 1} · ${cut.name}` : cut.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
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
    /** Optional: eigene Panel-Labels (z. B. FRONT/BACK) statt Before/After */
    labels?: { top: string; bottom: string };
  }
>(function TemplateEditor({ before, after, config, name, prefix, index, labels }, ref) {
  const [transforms, setTransforms] = useState<{
    before: ImageTransform;
    after: ImageTransform;
  }>({ before: { ...DEFAULT_TRANSFORM }, after: { ...DEFAULT_TRANSFORM } });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ slot: Slot; lastX: number; lastY: number } | null>(null);

  const effectiveConfig: BlueprintConfig = useMemo(
    () =>
      labels
        ? {
            ...config,
            texts: { ...config.texts, beforeLabel: labels.top, afterLabel: labels.bottom },
            // neutral schwarz statt rot/grün – FRONT/BACK ist kein Vorher/Nachher
            labelColors: { top: "#0a0a0a", bottom: "#0a0a0a" },
          }
        : config,
    [config, labels]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawBlueprint(canvas, before, after, effectiveConfig, transforms);
  }, [before, after, effectiveConfig, transforms]);

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
  const stepZoom = (slot: Slot, delta: number) =>
    setTransforms((t) => ({
      ...t,
      [slot]: {
        ...t[slot],
        scale: clamp(+(t[slot].scale + delta).toFixed(2), MIN_SCALE, MAX_SCALE),
      },
    }));

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
        <span className="truncate text-sm font-medium text-ink">{name}</span>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-ink bg-ink px-4 py-2 text-xs font-medium text-white active:bg-neutral-800"
          onClick={save}
        >
          Save
        </button>
      </div>
      <div className="space-y-3">
        {(["before", "after"] as const).map((slot) => (
          <div key={slot}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {labels ? (slot === "before" ? labels.top : labels.bottom) : slot} · zoom
              </span>
              <button
                type="button"
                className="text-[11px] text-ink-faint underline-offset-2 active:text-ink"
                onClick={() => reset(slot)}
              >
                reset
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`zoom out ${slot}`}
                className="zoom-btn"
                onClick={() => stepZoom(slot, -0.15)}
                disabled={transforms[slot].scale <= MIN_SCALE}
              >
                −
              </button>
              <input
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={0.01}
                value={transforms[slot].scale}
                onChange={(e) => patch(slot, { scale: Number(e.target.value) })}
                className="range-lg flex-1"
              />
              <button
                type="button"
                aria-label={`zoom in ${slot}`}
                className="zoom-btn"
                onClick={() => stepZoom(slot, 0.15)}
                disabled={transforms[slot].scale >= MAX_SCALE}
              >
                +
              </button>
            </div>
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
        className="aspect-square w-full rounded-lg border border-paper-border object-cover"
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

const BLOCKED_TEXT = {
  inactive: "Your access has been blocked. Please contact the admin.",
  "no-profile": "There is no clipper profile for this account. Please contact the admin.",
  "not-admin": "This area is for admins only.",
} as const;

/** Eingeloggt, aber der Account darf hier nicht rein. */
function BlockedScreen({ reason }: { reason: keyof typeof BLOCKED_TEXT }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="panel w-full max-w-sm p-6 text-center">
        <div className="logo-mark mx-auto">✂</div>
        <h1 className="brand-text mt-4 text-lg">CutG Studio</h1>
        <p className="mt-2 text-sm text-ink-muted">{BLOCKED_TEXT[reason]}</p>
        {reason === "not-admin" ? (
          <a href="#" className="btn-primary mt-5 block w-full py-2.5 text-sm">
            ← back to the studio
          </a>
        ) : (
          <button
            type="button"
            className="btn-secondary mt-5 w-full py-2.5 text-sm"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

/** Session steht, aber das Profil kam nicht durch (Netz/Server). */
function SessionErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="panel w-full max-w-sm p-6 text-center">
        <div className="logo-mark mx-auto">✂</div>
        <h1 className="brand-text mt-4 text-lg">CutG Studio</h1>
        <p className="mt-2 text-sm text-ink-muted">Could not load your profile.</p>
        <p className="mt-1 text-xs text-red-600">{message}</p>
        <button type="button" className="btn-primary mt-5 w-full py-2.5" onClick={onRetry}>
          Try again
        </button>
        <button
          type="button"
          className="mt-2 w-full text-xs text-ink-faint hover:text-ink"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  const { loading, profile, blocked, error, reload } = useSession();

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-ink-faint">Loading…</p>
      </div>
    );

  if (!profile) {
    if (blocked) return <BlockedScreen reason={blocked} />;
    if (error) return <SessionErrorScreen message={error} onRetry={reload} />;
    return <LoginScreen onSignedIn={reload} />;
  }

  if (route === "#admin")
    return profile.role === "admin" ? (
      <AdminPanel profile={profile} />
    ) : (
      <BlockedScreen reason="not-admin" />
    );

  if (route === "#history") return <MyHistory profile={profile} />;

  return <MainApp profile={profile} onReload={reload} />;
}
