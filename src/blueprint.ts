import type { BlueprintConfig } from "./types";

const FONT = '"DM Sans", system-ui, sans-serif';

/** 3:4 Hochformat */
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1440;
/** Supersampling: intern in 2× rendern → scharfe Kanten & Text, kein Verpixeln */
const SCALE = 2;
const DIVIDER_HEIGHT = 10;
const PANEL_HEIGHT = (CANVAS_HEIGHT - DIVIDER_HEIGHT) / 2;

const LABEL = {
  fontSize: 28,
  letterSpacing: 4,
  padX: 22,
  padY: 12,
};

export interface ImageTransform {
  /** -1 (ganz links) … 0 (mittig) … 1 (ganz rechts) */
  offsetX: number;
  /** -1 (zeigt unten) … 0 (mittig) … 1 (zeigt oben/Haare) */
  offsetY: number;
  /** 1 = cover, >1 = reinzoomen */
  scale: number;
}

export const DEFAULT_TRANSFORM: ImageTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

/** Zoom-Grenzen: <1 = rauszoomen (Blur-Rand), >1 = reinzoomen */
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 3;

const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

export interface BlueprintTransforms {
  before: ImageTransform;
  after: ImageTransform;
}

/** Anteil der Gesamthöhe, den das Vorher-Panel einnimmt (für Pointer-Mapping) */
export const PANEL_FRACTION = PANEL_HEIGHT / CANVAS_HEIGHT;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function coverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  transform: ImageTransform = DEFAULT_TRANSFORM
) {
  const { offsetX, offsetY, scale } = transform;
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;

  // Basis-"cover": kleinster Ausschnitt, der die Box füllt
  let sw: number;
  let sh: number;
  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = img.height * boxRatio;
  } else {
    sw = img.width;
    sh = img.width / boxRatio;
  }

  // Zoom: größerer scale → kleinerer Ausschnitt → näher dran
  const z = Math.max(1, scale);
  sw /= z;
  sh /= z;

  // Verschiebung innerhalb des verfügbaren Spielraums
  const freeX = img.width - sw;
  const freeY = img.height - sh;
  // offsetX: -1=links … +1=rechts ; offsetY: +1=oben (Haare) … -1=unten
  const sx = (freeX / 2) * (1 + clamp(offsetX, -1, 1));
  const sy = (freeY / 2) * (1 - clamp(offsetY, -1, 1));

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Weichzeichner OHNE ctx.filter (iOS Safari unterstützt Canvas-filter nicht).
 * Ein einzelner Riesensprung beim Hochskalieren erzeugt auf iOS blockige
 * Artefakte (nur bilineare Glättung). Deshalb: schrittweise per Halbieren
 * herunterskalieren und per Verdoppeln wieder hoch – jede Stufe glättet,
 * zusammen ergibt das einen weichen, gaußartigen Blur in jedem Browser.
 */
function drawBlurredCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  px: number,
  py: number,
  pw: number,
  ph: number
) {
  // Arbeitsfläche in Panel-Proportion, moderat aufgelöst
  const baseW = 512;
  const baseH = Math.max(1, Math.round((baseW * ph) / pw));
  let cur = document.createElement("canvas");
  cur.width = baseW;
  cur.height = baseH;
  let cctx = cur.getContext("2d");
  if (!cctx) return;
  cctx.imageSmoothingEnabled = true;
  cctx.imageSmoothingQuality = "high";
  coverImage(cctx, img, 0, 0, baseW, baseH);

  const step = (w: number, h: number): HTMLCanvasElement | null => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const x = c.getContext("2d");
    if (!x) return null;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(cur, 0, 0, c.width, c.height);
    return c;
  };

  // Runter: 512 → 256 → 128 → 64 → 32 → 16 (jede Stufe halbiert & glättet)
  for (let w = baseW / 2; w >= 16; w /= 2) {
    const next = step(w, (w * baseH) / baseW);
    if (!next) return;
    cur = next;
    cctx = cur.getContext("2d");
  }

  // Hoch: schrittweise verdoppeln bis ~Panelbreite (statt einem Riesensprung)
  for (let w = cur.width * 2; w < pw; w *= 2) {
    const next = step(w, (w * baseH) / baseW);
    if (!next) return;
    cur = next;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, px, py, pw, ph);
}

/**
 * Zeichnet ein Bild in ein Panel: bei Zoom <1 entsteht ein Rand, der mit einer
 * unscharfen (geblurrten) Cover-Version desselben Bildes gefüllt wird.
 */
function drawPanel(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  px: number,
  py: number,
  pw: number,
  ph: number,
  transform: ImageTransform
) {
  const f = clampScale(transform.scale);

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();

  // Blur-Hintergrund nur nötig, wenn das Bild das Panel nicht mehr füllt
  if (f < 1) {
    drawBlurredCover(ctx, img, px, py, pw, ph);
    // leichte Abdunklung für besseren Kontrast zum Vordergrund
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(px, py, pw, ph);
  }

  // Vordergrund: Bild in Cover-Größe × Zoom, mittig + Verschiebung
  const coverScale = Math.max(pw / img.width, ph / img.height);
  const dw = img.width * coverScale * f;
  const dh = img.height * coverScale * f;
  const slackX = Math.abs(dw - pw) / 2;
  const slackY = Math.abs(dh - ph) / 2;
  const dx = px + (pw - dw) / 2 - clamp(transform.offsetX, -1, 1) * slackX;
  const dy = py + (ph - dh) / 2 + clamp(transform.offsetY, -1, 1) * slackY;
  ctx.drawImage(img, dx, dy, dw, dh);

  ctx.restore();
}

function roundRect(
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

function measureSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number
) {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += ctx.measureText(text[i]).width;
    if (i < text.length - 1) width += letterSpacing;
  }
  return width;
}

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number
) {
  let cursor = x;
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], cursor, y);
    cursor += ctx.measureText(text[i]).width + letterSpacing;
  }
}

function drawLiquidGlassPill(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  options: {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    letterSpacing: number;
    padX: number;
    padY: number;
    uppercase?: boolean;
    blur?: number;
    tint?: number;
    highlight?: number;
    border?: number;
    textShadow?: boolean;
    backgroundColor?: string;
    borderColor?: string;
    textColor?: string;
  }
) {
  const {
    text: rawText,
    x,
    y,
    fontSize,
    letterSpacing,
    padX,
    padY,
    uppercase = false,
    blur = 18,
    tint = 0.16,
    highlight = 0.09,
    border = 0.5,
    textShadow = true,
    backgroundColor,
    borderColor,
    textColor = "#ffffff",
  } = options;

  const text = uppercase ? rawText.toUpperCase() : rawText;

  ctx.font = `500 ${fontSize}px ${FONT}`;
  ctx.textBaseline = "middle";

  const textW = measureSpacedText(ctx, text, letterSpacing);
  const pillW = textW + padX * 2;
  const pillH = fontSize + padY * 2;
  const radius = pillH / 2;

  const blurPad = 20;
  if (backgroundColor) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = backgroundColor;
    roundRect(ctx, x, y, pillW, pillH, radius);
    ctx.fill();
    ctx.restore();
  } else {
    const sample = document.createElement("canvas");
    sample.width = pillW + blurPad * 2;
    sample.height = pillH + blurPad * 2;
    const sampleCtx = sample.getContext("2d");
    if (!sampleCtx) return { width: pillW, height: pillH };

    sampleCtx.drawImage(
      sourceCanvas,
      x - blurPad,
      y - blurPad,
      pillW + blurPad * 2,
      pillH + blurPad * 2,
      0,
      0,
      pillW + blurPad * 2,
      pillH + blurPad * 2
    );

    const frosted = document.createElement("canvas");
    frosted.width = pillW;
    frosted.height = pillH;
    const frostedCtx = frosted.getContext("2d");
    if (!frostedCtx) return { width: pillW, height: pillH };

    frostedCtx.filter = `blur(${blur}px) saturate(1.25)`;
    frostedCtx.drawImage(sample, blurPad, blurPad, pillW, pillH, 0, 0, pillW, pillH);

    ctx.save();
    roundRect(ctx, x, y, pillW, pillH, radius);
    ctx.clip();
    ctx.drawImage(frosted, x, y);

    ctx.fillStyle = `rgba(255, 255, 255, ${tint})`;
    ctx.fillRect(x, y, pillW, pillH);

    ctx.fillStyle = `rgba(255, 255, 255, ${highlight})`;
    ctx.fillRect(x, y, pillW, pillH * 0.45);
    ctx.restore();
  }

  ctx.strokeStyle = borderColor || `rgba(255, 255, 255, ${border})`;
  ctx.lineWidth = 1.25;
  roundRect(ctx, x, y, pillW, pillH, radius);
  ctx.stroke();

  if (textShadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 1;
  }

  ctx.fillStyle = textColor;
  drawSpacedText(ctx, text, x + padX, y + pillH / 2, letterSpacing);

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  return { width: pillW, height: pillH };
}

function drawLiquidGlassLabel(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  text: string,
  x: number,
  y: number,
  backgroundColor: string
) {
  const { fontSize, letterSpacing, padX, padY } = LABEL;

  return drawLiquidGlassPill(ctx, sourceCanvas, {
    text,
    x,
    y,
    fontSize,
    letterSpacing,
    padX,
    padY,
    uppercase: true,
    blur: 16,
    border: 0.48,
    backgroundColor,
    borderColor: "rgba(255, 255, 255, 0.78)",
  });
}

function drawLiquidGlassBranding(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  brandName: string,
  canvasWidth: number,
  canvasHeight: number
) {
  const text = `Try ${brandName}`;
  const fontSize = 26;
  const letterSpacing = 2.5;
  const padX = 28;
  const padY = 14;
  const bottomMargin = 40;

  ctx.font = `500 ${fontSize}px ${FONT}`;
  const textW = measureSpacedText(ctx, text, letterSpacing);
  const pillW = textW + padX * 2;
  const pillH = fontSize + padY * 2;
  const x = (canvasWidth - pillW) / 2;
  const y = canvasHeight - bottomMargin - pillH;

  drawLiquidGlassPill(ctx, sourceCanvas, {
    text,
    x,
    y,
    fontSize,
    letterSpacing,
    padX,
    padY,
    blur: 20,
    border: 0.55,
    backgroundColor: "#000000",
    borderColor: "rgba(255, 255, 255, 0.7)",
  });
}

/**
 * Stellt sicher, dass die Schrift geladen ist (einmalig, danach instant).
 * Nur die einzelne Familie an document.fonts.load übergeben – iOS Safari wirft
 * sonst "The string did not match the expected pattern." bei der Familienliste.
 * Fehler werden geschluckt, damit die Generierung nie daran scheitert.
 */
export async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`500 ${LABEL.fontSize}px "DM Sans"`),
      document.fonts.load(`500 26px "DM Sans"`),
    ]);
  } catch {
    /* Schrift optional – im Zweifel rendert der Canvas mit Fallback-Font */
  }
}

const DEFAULT_TRANSFORMS: BlueprintTransforms = {
  before: DEFAULT_TRANSFORM,
  after: DEFAULT_TRANSFORM,
};

/**
 * Zeichnet das Template synchron in das übergebene Canvas (für Live-Vorschau).
 * Bilder & Fonts müssen bereits geladen sein.
 */
export function drawBlueprint(
  canvas: HTMLCanvasElement,
  beforeImg: HTMLImageElement,
  afterImg: HTMLImageElement,
  config: BlueprintConfig,
  transforms: BlueprintTransforms = DEFAULT_TRANSFORMS
): void {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  const margin = 36;

  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");

  // Alles in logischen Koordinaten zeichnen, Ausgabe aber in 2× Auflösung
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  drawPanel(ctx, beforeImg, 0, 0, width, PANEL_HEIGHT, transforms.before);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, PANEL_HEIGHT, width, DIVIDER_HEIGHT);

  drawPanel(
    ctx,
    afterImg,
    0,
    PANEL_HEIGHT + DIVIDER_HEIGHT,
    width,
    PANEL_HEIGHT,
    transforms.after
  );

  drawLiquidGlassLabel(
    ctx,
    canvas,
    config.texts.beforeLabel,
    margin,
    margin,
    config.labelColors?.top ?? "#dc2626"
  );

  drawLiquidGlassLabel(
    ctx,
    canvas,
    config.texts.afterLabel,
    margin,
    PANEL_HEIGHT + DIVIDER_HEIGHT + margin,
    config.labelColors?.bottom ?? "#16a34a"
  );

  if (config.showBranding) {
    drawLiquidGlassBranding(ctx, canvas, config.brandName, width, height);
  }
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

interface Shareable {
  dataUrl: string;
  filename: string;
}

/**
 * Speichert ein Bild: auf Mobilgeräten über die Web-Share-API (Teilen-Menü →
 * „In Fotos/Galerie sichern"); sonst normaler Download.
 */
export async function saveImage(dataUrl: string, filename: string): Promise<void> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[] }) => Promise<void>;
  };
  try {
    const file = await dataUrlToFile(dataUrl, filename);
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return;
      } catch (err) {
        // Nutzer hat das Teilen-Menü abgebrochen → nichts weiter tun
        if (err instanceof DOMException && err.name === "AbortError") return;
        // andere Fehler → Fallback unten
      }
    }
  } catch {
    /* Fallback unten */
  }
  downloadDataUrl(dataUrl, filename);
}

/** Speichert mehrere Bilder auf einmal (ein Teilen-Menü) bzw. lädt sie einzeln. */
export async function saveImages(items: Shareable[]): Promise<void> {
  if (!items.length) return;
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[] }) => Promise<void>;
  };
  try {
    const files = await Promise.all(
      items.map((it) => dataUrlToFile(it.dataUrl, it.filename))
    );
    if (nav.canShare && nav.share && nav.canShare({ files })) {
      try {
        await nav.share({ files });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
  } catch {
    /* Fallback unten */
  }
  items.forEach((it) => downloadDataUrl(it.dataUrl, it.filename));
}
