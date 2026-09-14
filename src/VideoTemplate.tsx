import { useEffect, useMemo, useRef, useState } from "react";
import { ensureFonts, loadImage } from "./blueprint";
import { logEvent } from "./session";
import { recordCanvasVideo, saveVideoBlob } from "./video";
import type { Gender, HairstyleGroup } from "./types";

/**
 * Template 3 – "AI recommendation" video.
 * Rendert ein fertiges Hochkant-Video (Gesicht → Scan-Animation → empfohlene
 * Frisur + Daten). Alle Werte werden manuell gesetzt – hier arbeitet keine KI,
 * es sieht nur so aus.
 */

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
export const VIDEO_DURATION = 7.5;

const FIND_START = 0.6;
const REVEAL = 4.0;

const F = '"DM Sans", system-ui, sans-serif';

export interface VideoData {
  title: string;
  styleName: string;
  match: string;
  faceShape: string;
  hairType: string;
  brandName: string;
  showBranding: boolean;
  tickerNames: string[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Cover-Zeichnung mit Zoomfaktor (>1 = näher dran), mittig */
function coverZoom(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number
) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) sw = img.height * boxRatio;
  else sh = img.width / boxRatio;
  sw /= zoom;
  sh /= zoom;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Text mit manuellem Letter-Spacing, zentriert (Editorial-Caps-Look) */
function drawSpacedCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number
) {
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += ctx.measureText(text[i]).width;
    if (i < text.length - 1) total += spacing;
  }
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += ctx.measureText(text[i]).width + spacing;
  }
  ctx.textAlign = prevAlign;
}

/** Animiertes Filmkorn (2 vorberechnete Frames, abwechselnd gezeichnet) */
let noiseFrames: HTMLCanvasElement[] | null = null;
function getNoiseFrames(): HTMLCanvasElement[] {
  if (!noiseFrames) {
    noiseFrames = [0, 1].map(() => {
      const c = document.createElement("canvas");
      c.width = 270;
      c.height = 480;
      const x = c.getContext("2d")!;
      const d = x.createImageData(c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() * 255;
        d.data[i] = v;
        d.data[i + 1] = v;
        d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      return c;
    });
  }
  return noiseFrames;
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  weight = "700"
): number {
  let size = startPx;
  ctx.font = `${weight} ${size}px ${F}`;
  while (size > 30 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${F}`;
  }
  return size;
}

interface PillOpts {
  font: string;
  padX: number;
  padY: number;
  bg: string;
  fg: string;
  border?: string;
}

function measurePill(ctx: CanvasRenderingContext2D, text: string, o: PillOpts) {
  ctx.font = o.font;
  const m = ctx.measureText(text);
  const fontPx = parseInt(o.font.match(/(\d+)px/)?.[1] ?? "36", 10);
  return { w: m.width + o.padX * 2, h: fontPx + o.padY * 2 };
}

function drawPillAt(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  cy: number,
  o: PillOpts
): number {
  const { w, h } = measurePill(ctx, text, o);
  rr(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = o.bg;
  ctx.fill();
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = 2;
    rr(ctx, x, cy - h / 2, w, h, h / 2);
    ctx.stroke();
  }
  ctx.fillStyle = o.fg;
  ctx.font = o.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + o.padX, cy + 2);
  return w;
}

function drawPillCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  o: PillOpts
) {
  const { w } = measurePill(ctx, text, o);
  drawPillAt(ctx, text, cx - w / 2, cy, o);
}

/** Eine Frame des Videos zeichnen (pur, testbar). t in Sekunden. */
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  photo: HTMLImageElement,
  d: VideoData
) {
  const W = VIDEO_W;
  const H = VIDEO_H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textBaseline = "middle";

  const findP = clamp01((t - FIND_START) / (REVEAL - FIND_START));

  // ── Foto: Vollbild, langsamer Ken-Burns-Zoom + Punch beim Reveal ─────────
  const punch = t >= REVEAL ? 0.05 * Math.exp(-(t - REVEAL) * 6) : 0;
  const zoom = 1.02 + 0.1 * (t / VIDEO_DURATION) + punch;
  coverZoom(ctx, photo, 0, 0, W, H, zoom);

  // Licht-Sheen, der während der Suche diagonal durchläuft
  if (t >= FIND_START && t < REVEAL) {
    const sx = -400 + (W + 800) * ((findP * 2) % 1);
    ctx.save();
    ctx.translate(sx, H / 2);
    ctx.rotate(-0.32);
    const g = ctx.createLinearGradient(-220, 0, 220, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.10)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-220, -H, 440, H * 2);
    ctx.restore();
  }

  // ── Cineastische Verläufe + Vignette ─────────────────────────────────────
  const top = ctx.createLinearGradient(0, 0, 0, 360);
  top.addColorStop(0, "rgba(0,0,0,0.62)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 360);

  const bottom = ctx.createLinearGradient(0, 1050, 0, H);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 1050, W, H - 1050);

  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // ── Kopf: Marke + Titel (Editorial-Caps) ────────────────────────────────
  const introA = clamp01(t / 0.5);
  ctx.globalAlpha = introA;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `700 46px ${F}`;
  ctx.fillText(`✂ ${d.brandName || "CutG"}`, W / 2, 118);
  ctx.font = `600 30px ${F}`;
  ctx.globalAlpha = introA * 0.85;
  drawSpacedCentered(ctx, d.title.toUpperCase(), W / 2, 196, 9);
  ctx.globalAlpha = 1;

  if (t < REVEAL) {
    // ── Suche: Slot-Machine der Style-Namen, rastet auf dem Ziel ein ───────
    const flips = 26;
    const pool = d.tickerNames.filter((n) => n !== d.styleName);
    const n = Math.min(flips, Math.floor(flips * easeOutCubic(findP)));
    const current =
      n >= flips || !pool.length ? d.styleName : pool[n % pool.length];

    if (t >= FIND_START) {
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `600 30px ${F}`;
      drawSpacedCentered(ctx, "FINDING YOUR CUT", W / 2, 1258, 8);

      // rotierender Ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      const a0 = t * 5;
      ctx.arc(W / 2, 1176, 26, a0, a0 + Math.PI * 1.4);
      ctx.stroke();

      // großer, schnell wechselnder Name (Mikro-Versatz pro Wechsel)
      const jitter = n >= flips ? 0 : (n % 2 === 0 ? 1 : -1) * 6;
      ctx.shadowBlur = 24;
      ctx.fillStyle = "#ffffff";
      const size = fitFont(ctx, current, 920, 96, "800");
      ctx.font = `800 ${size}px ${F}`;
      ctx.globalAlpha = 0.94;
      ctx.fillText(current, W / 2 + jitter, 1420);
      ctx.globalAlpha = 1;

      // feine Fortschrittslinie + Prozent
      ctx.shadowBlur = 0;
      const lx = 140;
      const lw = W - 280;
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(lx, 1560, lw, 3);
      const p = easeInOut(findP);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(lx, 1559, lw * p, 5);
      ctx.font = `600 28px ${F}`;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(p * 100)}%`, lx + lw, 1618);
      ctx.textAlign = "center";
    }
  } else {
    // ── Ergebnis: Name mit Overshoot, Unterstrich, Details-Zeile ───────────
    const a1 = clamp01((t - REVEAL) / 0.45);
    const a2 = clamp01((t - REVEAL - 0.2) / 0.45);
    const a3 = clamp01((t - REVEAL - 0.4) / 0.45);

    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `600 30px ${F}`;
    ctx.globalAlpha = a1;
    drawSpacedCentered(ctx, "YOUR PERFECT CUT", W / 2, 1268, 9);

    const s = 0.9 + 0.1 * easeOutBack(easeOutCubic(a1));
    ctx.save();
    ctx.translate(W / 2, 1408);
    ctx.scale(s, s);
    ctx.globalAlpha = a1;
    ctx.shadowBlur = 26;
    ctx.fillStyle = "#ffffff";
    const nameSize = fitFont(ctx, d.styleName, 920, 108, "800");
    ctx.font = `800 ${nameSize}px ${F}`;
    ctx.fillText(d.styleName, 0, 0);
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.font = `800 ${fitFont(ctx, d.styleName, 920, 108, "800")}px ${F}`;
    const uw = Math.min(920, ctx.measureText(d.styleName).width) * easeOutCubic(a2);
    ctx.globalAlpha = a2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(W / 2 - uw / 2, 1492, uw, 5);

    ctx.globalAlpha = a2 * 0.92;
    ctx.shadowBlur = 12;
    ctx.font = `600 32px ${F}`;
    const details = `${d.match || "98"}% MATCH  ·  ${(d.faceShape || "OVAL").toUpperCase()} FACE  ·  ${(d.hairType || "THICK").toUpperCase()} HAIR`;
    drawSpacedCentered(ctx, details, W / 2, 1584, 4);

    if (d.showBranding) {
      ctx.globalAlpha = a3;
      ctx.shadowBlur = 18;
      drawPillCentered(ctx, `Try ${d.brandName || "CutG"}`, W / 2, 1730, {
        font: `600 36px ${F}`,
        padX: 54,
        padY: 27,
        bg: "#ffffff",
        fg: "#0a0a0a",
      });
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Blitz beim Reveal
    const flash = Math.max(0, 1 - (t - REVEAL) / 0.16);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ── Filmkorn (animiert) ─────────────────────────────────────────────────
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.045;
  const frames = getNoiseFrames();
  ctx.drawImage(frames[Math.floor(t * 10) % frames.length], 0, 0, W, H);
  ctx.globalAlpha = 1;
}

export default function VideoTemplate({
  gender,
  groups,
  brandName,
  showBranding,
}: {
  gender: Gender;
  groups: HairstyleGroup[];
  brandName: string;
  showBranding: boolean;
}) {
  const [photo, setPhoto] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [styleName, setStyleName] = useState("");
  const [title, setTitle] = useState("Hairstyle Match");
  const [match, setMatch] = useState("98");
  const [faceShape, setFaceShape] = useState("Oval");
  const [hairType, setHairType] = useState("Thick");
  const [exporting, setExporting] = useState(false);
  const [video, setVideo] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportingRef = useRef(false);
  const dataRef = useRef<VideoData | null>(null);

  const tickerNames = useMemo(
    () => groups.flatMap((g) => g.cuts.map((c) => c.name)),
    [groups]
  );

  // Zielgruppe gewechselt → gewählter Style existiert evtl. nicht mehr
  useEffect(() => {
    if (styleName && !tickerNames.includes(styleName)) setStyleName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

  useEffect(() => {
    ensureFonts();
  }, []);

  // Aktuelle Daten für die Zeichenschleife bereithalten (ohne Loop-Neustart)
  dataRef.current = {
    title,
    styleName: styleName || "—",
    match,
    faceShape,
    hairType,
    brandName,
    showBranding,
    tickerNames,
  };

  const ready = !!photo && !!styleName;

  // Live-Vorschau: Animation in Dauerschleife
  useEffect(() => {
    if (!photo || !styleName) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      if (!exportingRef.current && dataRef.current) {
        const t = ((performance.now() - t0) / 1000) % (VIDEO_DURATION + 0.8);
        drawVideoFrame(ctx, Math.min(t, VIDEO_DURATION), photo.img, dataRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [photo, styleName]);

  const setFile = async (file: File | null) => {
    setError(null);
    setVideo(null);
    if (!file) {
      setPhoto(null);
      return;
    }
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await loadImage(src);
    setPhoto({ src, img });
  };

  const exportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !photo || !ready || exporting) return;
    setError(null);
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);

    setExporting(true);
    exportingRef.current = true;
    try {
      await ensureFonts();
      const ctx = canvas.getContext("2d")!;
      const { blob, ext } = await recordCanvasVideo(canvas, VIDEO_DURATION, (t) =>
        drawVideoFrame(ctx, t, photo.img, dataRef.current!)
      );
      setVideo({ url: URL.createObjectURL(blob), blob, ext });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video export failed");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const saveVideo = () => {
    if (!video) return;
    const filename = `cutg-reco-${styleName.replace(/\s+/g, "-").toLowerCase()}.${video.ext}`;
    logEvent("download", 1, { filename, kind: "video" });
    saveVideoBlob(video.blob, filename);
  };

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          1 · Add a face photo
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          The photo stays on screen the whole video: scan animation → your chosen
          recommendation. No AI involved — every value below is yours to set.
        </p>
        <div className="mt-4">
          {photo ? (
            <div className="flex items-center gap-4">
              <img src={photo.src} alt="" className="h-20 w-20 rounded-lg object-cover" />
              <button
                type="button"
                className="text-xs text-ink-faint hover:text-ink hover:underline"
                onClick={() => setFile(null)}
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
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
      </div>

      <div className="panel p-6">
        <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          2 · Recommendation & data
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-faint">Recommended hairstyle</label>
            <select
              className="input-field py-2.5"
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
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
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-faint">Video title</label>
            <input
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-faint">Match %</label>
            <input
              className="input-field"
              inputMode="numeric"
              value={match}
              onChange={(e) => setMatch(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-faint">Face shape</label>
            <input
              className="input-field"
              value={faceShape}
              onChange={(e) => setFaceShape(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-faint">Hair type</label>
            <input
              className="input-field"
              value={hairType}
              onChange={(e) => setHairType(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
            Preview ({VIDEO_DURATION}s · 1080×1920)
          </h2>
          {video && (
            <button type="button" className="btn-secondary text-xs" onClick={saveVideo}>
              Save video
            </button>
          )}
        </div>

        {ready ? (
          <div className="mx-auto w-full max-w-[300px]">
            <canvas
              ref={canvasRef}
              width={VIDEO_W}
              height={VIDEO_H}
              className="block w-full rounded-lg border border-paper-border"
            />
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-10 text-center">
            <p className="text-sm font-medium text-ink-muted">your video appears here</p>
            <p className="mt-2 text-xs text-ink-faint">
              add a photo and pick a hairstyle · the preview loops automatically
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn-primary w-full py-4 text-sm uppercase tracking-widest"
        disabled={!ready || exporting}
        onClick={exportVideo}
      >
        {exporting ? `Recording video… (${VIDEO_DURATION}s)` : "Export video"}
      </button>

      {video && (
        <div className="panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
              Your video (.{video.ext})
            </h2>
            <button type="button" className="btn-secondary text-xs" onClick={saveVideo}>
              Save video
            </button>
          </div>
          <video
            src={video.url}
            controls
            playsInline
            className="mx-auto w-full max-w-[300px] rounded-lg border border-paper-border"
          />
        </div>
      )}
    </section>
  );
}
