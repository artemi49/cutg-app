import { useEffect, useMemo, useRef, useState } from "react";
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
} from "./blueprint";
import type { ImageTransform } from "./blueprint";
import {
  BEARD_STYLES,
  DEFAULT_TEXTS,
  GENDERS,
  HAIRCUT_GROUPS_BY_GENDER,
  LANGUAGES,
  UI_LABELS,
  buildBeardPrompt,
  buildHaircutPrompt,
} from "./constants";
import type { BlueprintConfig, Gender, Language } from "./types";

type ImageSlot = "before" | "after";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export default function LegacyStudio() {
  const [language, setLanguage] = useState<Language>("en");
  const [gender, setGender] = useState<Gender>(
    () => (localStorage.getItem("cutg_gender") as Gender) ?? "men"
  );
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [texts, setTexts] = useState(DEFAULT_TEXTS.en);
  const [accentColor, setAccentColor] = useState("#0a0a0a");
  const [brandName, setBrandName] = useState("CutG");
  const [showBranding, setShowBranding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCut, setCopiedCut] = useState<string | null>(null);
  const [transforms, setTransforms] = useState<{
    before: ImageTransform;
    after: ImageTransform;
  }>({ before: { ...DEFAULT_TRANSFORM }, after: { ...DEFAULT_TRANSFORM } });
  const [ready, setReady] = useState({ before: false, after: false });
  const [fontsLoaded, setFontsLoaded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beforeImgRef = useRef<HTMLImageElement | null>(null);
  const afterImgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ slot: ImageSlot; lastX: number; lastY: number } | null>(
    null
  );

  // App-Oberfläche immer Englisch; das Sprach-Dropdown steuert nur die Template-Labels
  const ui = UI_LABELS.en;
  const bothReady = ready.before && ready.after;

  const blueprintConfig: BlueprintConfig = useMemo(
    () => ({
      language,
      texts,
      accentColor,
      showBranding,
      brandName,
    }),
    [language, texts, accentColor, showBranding, brandName]
  );

  // Schriften einmalig laden
  useEffect(() => {
    ensureFonts().then(() => setFontsLoaded(true));
  }, []);

  // Live-Render bei jeder Änderung (synchron, schnell)
  useEffect(() => {
    const canvas = canvasRef.current;
    const before = beforeImgRef.current;
    const after = afterImgRef.current;
    if (!canvas || !before || !after || !fontsLoaded) return;
    drawBlueprint(canvas, before, after, blueprintConfig, transforms);
  }, [blueprintConfig, transforms, fontsLoaded, ready]);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setTexts(DEFAULT_TEXTS[lang]);
  };

  const handleFileChange = async (slot: ImageSlot, file: File | null) => {
    const currentUrl = slot === "before" ? beforeUrl : afterUrl;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    setError(null);

    const setUrl = slot === "before" ? setBeforeUrl : setAfterUrl;
    const imgRef = slot === "before" ? beforeImgRef : afterImgRef;

    if (!file) {
      imgRef.current = null;
      setUrl(null);
      setReady((r) => ({ ...r, [slot]: false }));
      return;
    }

    const url = URL.createObjectURL(file);
    setUrl(url);
    setTransforms((t) => ({ ...t, [slot]: { ...DEFAULT_TRANSFORM } }));

    try {
      const img = await loadImage(url);
      imgRef.current = img;
      setReady((r) => ({ ...r, [slot]: true }));
    } catch {
      setError("Image could not be loaded");
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !bothReady) return;
    saveImage(canvas.toDataURL("image/png"), `cutg-${Date.now()}.png`);
  };

  const patchTransform = (slot: ImageSlot, patch: Partial<ImageTransform>) => {
    setTransforms((t) => ({ ...t, [slot]: { ...t[slot], ...patch } }));
  };

  const resetTransform = (slot: ImageSlot) =>
    setTransforms((t) => ({ ...t, [slot]: { ...DEFAULT_TRANSFORM } }));

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !bothReady) return;
    const rect = canvas.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    const slot: ImageSlot = relY < PANEL_FRACTION ? "before" : "after";
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
          // ziehen nach unten zeigt den oberen Bildteil (Haare)
          offsetY: clamp(cur.offsetY + (dy / panelH) * 2, -1, 1),
          // ziehen nach rechts zeigt den linken Bildteil
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

  const updateText = (key: keyof typeof texts, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
  };

  const copyPrompt = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback für Browser ohne Clipboard-API
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedCut(key);
    window.setTimeout(() => {
      setCopiedCut((current) => (current === key ? null : current));
    }, 1600);
  };

  const imageSlots = [
    ["before", ui.beforeUpload, beforeUrl],
    ["after", ui.afterUpload, afterUrl],
  ] as const;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-paper-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="logo-mark">✂</div>
            <div>
              <h1 className="brand-text text-xl">CutG</h1>
              <p className="mt-0.5 text-sm text-ink-muted">before · after · tiktok</p>
            </div>
          </div>
          <span className="rounded-full border border-paper-border bg-white px-4 py-1.5 text-xs font-medium tracking-widest text-ink-muted">
            {CANVAS_WIDTH} × {CANVAS_HEIGHT}
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 py-10 lg:grid-cols-2">
        <div className="space-y-8">
          <section className="panel p-6">
            <h2 className="mb-1 text-xs font-medium uppercase tracking-widest text-ink-faint">
              {ui.uploadTitle}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Output: {CANVAS_WIDTH} × {CANVAS_HEIGHT} px · 3:4 format
            </p>
            <p className="mt-2 text-xs text-ink-faint">
              💡 Tip: generate the after image in{" "}
              <a
                href="https://ai.byteplus.com/lumina/en/model/image"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink underline underline-offset-2"
              >
                Lumina (GPT Image 2)
              </a>{" "}
              and upload it here.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {imageSlots.map(([slot, label, imageUrl]) => (
                <div key={slot}>
                  <span className="mb-2 block text-xs text-ink-faint">{label}</span>
                  <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-paper-border bg-paper-warm px-4 py-8 text-center transition hover:border-ink hover:bg-white">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={label}
                        className="max-h-48 rounded-xl object-contain"
                      />
                    ) : (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-paper-border bg-white">
                          <span className="text-lg text-ink-muted">+</span>
                        </div>
                        <span className="mt-4 text-sm font-medium text-ink">Upload image</span>
                        <span className="mt-1 text-xs text-ink-faint">{ui.uploadHint}</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => handleFileChange(slot, e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      className="mt-3 text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                      onClick={() => handleFileChange(slot, null)}
                    >
                      remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-6">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-base">✂️</span>
                <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                  Hairstyles · copy prompt
                </h2>
              </div>
              <div className="flex rounded-full border border-paper-border bg-paper-warm p-1">
                {GENDERS.map((g) => (
                  <button
                    key={g.code}
                    type="button"
                    aria-pressed={gender === g.code}
                    onClick={() => {
                      setGender(g.code);
                      localStorage.setItem("cutg_gender", g.code);
                    }}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                      gender === g.code
                        ? "bg-ink text-white"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    <span aria-hidden>{g.icon}</span>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Tap a style → the JSON prompt is copied to your clipboard. Paste it in{" "}
              <a
                href="https://ai.byteplus.com/lumina/en/model/image"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink underline underline-offset-2"
              >
                Lumina
              </a>{" "}
              with the before photo — only the hair changes.
            </p>

            <div className="mt-4 max-h-80 space-y-4 overflow-y-auto pr-1">
              {HAIRCUT_GROUPS_BY_GENDER[gender].map((group) => (
                <div key={group.group}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    {group.group}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.cuts.map((cut) => {
                      const key = `${gender}:${cut.name}`;
                      return (
                        <button
                          key={cut.name}
                          type="button"
                          title={cut.details}
                          onClick={() => copyPrompt(buildHaircutPrompt(cut, gender), key)}
                          className={`chip ${copiedCut === key ? "chip-active" : ""}`}
                        >
                          {copiedCut === key ? (
                            "✓ Copied"
                          ) : (
                            <>
                              {cut.kind === "color" && <span aria-hidden>◐ </span>}
                              {cut.name}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`panel p-6 ${gender === "men" ? "" : "hidden"}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base">🧔</span>
              <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                Beards & moustaches · copy prompt
              </h2>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Tap a style → the JSON prompt is copied. Paste it in Lumina with the
              photo — only the beard changes.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {BEARD_STYLES.map((b) => {
                const key = `beard:${b.name}`;
                return (
                  <button
                    key={b.name}
                    type="button"
                    title={b.details}
                    onClick={() => copyPrompt(buildBeardPrompt(b.name, b.details), key)}
                    className={`chip ${copiedCut === key ? "chip-active" : ""}`}
                  >
                    {copiedCut === key ? "✓ Copied" : b.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-ink-faint">
              {ui.texts}
            </h2>

            <div className="mb-5">
              <label className="mb-2 block text-xs text-ink-faint">{ui.language}</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`chip ${language === lang.code ? "chip-active" : ""}`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-ink-faint">{texts.beforeLabel}</label>
                <input
                  className="input-field"
                  value={texts.beforeLabel}
                  onChange={(e) => updateText("beforeLabel", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-faint">{texts.afterLabel}</label>
                <input
                  className="input-field"
                  value={texts.afterLabel}
                  onChange={(e) => updateText("afterLabel", e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-ink-faint">{ui.accentColor}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-paper-border bg-white"
                  />
                  <input
                    className="input-field"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-faint">{ui.brandName}</label>
                <input
                  className="input-field"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={showBranding}
                onChange={(e) => setShowBranding(e.target.checked)}
                className="h-4 w-4 rounded border-paper-border accent-ink"
              />
              <span className="text-sm text-ink-muted">{ui.showBranding}</span>
            </label>
          </section>

          {error && (
            <div className="whitespace-pre-wrap rounded-2xl border border-ink/20 bg-white px-4 py-3 text-sm text-ink">
              {error}
            </div>
          )}

          <button
            type="button"
            className="btn-primary w-full py-4 text-sm uppercase tracking-widest"
            disabled={!bothReady}
            onClick={handleDownload}
          >
            {ui.download}
          </button>
        </div>

        <section className="panel sticky top-6 p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
              preview
            </h2>
            {bothReady && (
              <button type="button" className="btn-secondary text-xs" onClick={handleDownload}>
                {ui.download}
              </button>
            )}
          </div>

          <div className="flex items-center justify-center rounded-2xl border border-paper-border bg-paper-warm p-2">
            {bothReady ? (
              <div className="mx-auto w-full max-w-[340px]">
                <canvas
                  ref={canvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="block w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
                />
              </div>
            ) : (
              <div className="flex min-h-[480px] flex-col items-center justify-center px-10 text-center">
                <p className="text-sm font-medium text-ink-muted">your template appears here</p>
                <p className="mt-2 text-xs text-ink-faint">
                  upload both images · then drag & zoom
                </p>
              </div>
            )}
          </div>

          {bothReady && (
            <div className="mt-4 space-y-4">
              <p className="text-center text-xs text-ink-faint">
                ↕ drag the image to reposition · slider to zoom
              </p>
              {(["before", "after"] as const).map((slot) => (
                <div key={slot} className="rounded-xl border border-paper-border bg-paper-warm p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">
                      {slot === "before" ? texts.beforeLabel : texts.afterLabel}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                      onClick={() => resetTransform(slot)}
                    >
                      center
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-faint">Zoom</span>
                    <input
                      type="range"
                      min={MIN_SCALE}
                      max={MAX_SCALE}
                      step={0.01}
                      value={transforms[slot].scale}
                      onChange={(e) =>
                        patchTransform(slot, { scale: Number(e.target.value) })
                      }
                      className="h-1 flex-1 cursor-pointer accent-ink"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mt-auto border-t border-paper-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6">
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
