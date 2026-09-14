import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  DEFAULT_TRANSFORM,
  MAX_SCALE,
  MIN_SCALE,
  drawPanel,
  ensureFonts,
  loadImage,
  saveImage,
} from "./blueprint";
import type { ImageTransform } from "./blueprint";
import { SUBJECT } from "./constants";
import { PASTE_SHORTCUT, usePasteImages } from "./paste";
import { logEvent, rpc } from "./session";
import { recordCanvasVideo, saveVideoBlob } from "./video";
import type { Gender, HairStyle, HairstyleGroup } from "./types";

/**
 * Template 4 – "Hair report" scroll video.
 * Ablauf: weißer Ladescreen mit CutG-Logo → Einblenden → die Report-Seite
 * scrollt durch (Vorher links / Nachher rechts, Barber Recommendation, Details,
 * Match-Banner). Keine KI – alle Bilder & Texte kommen vom Nutzer.
 */

export const V4_W = 1080;
export const V4_H = 1920;
export const V4_DURATION = 12;

const LOAD_END = 2.6;
const UNBLUR_END = 3.2;

const F = '"DM Sans", system-ui, sans-serif';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type PhotoSlot = "before" | "after";
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/** Scroll-Zeitplan: feste Zeiten, Ziel-Positionen kommen aus dem Layout */
const SCROLL_TIMES = [3.4, 5.9, 6.5, 8.3, 8.8, 10.5, 10.9, 11.7, V4_DURATION];

function scrollFrac(t: number, stops: number[]): number {
  // stops = [s1, s2, s3]; Ablauf: 0 → s1 (Stopp) → s2 (Stopp) → s3 (Stopp) → 1
  const fr = [0, stops[0], stops[0], stops[1], stops[1], stops[2], stops[2], 1, 1];
  if (t <= SCROLL_TIMES[0]) return 0;
  for (let i = 0; i < SCROLL_TIMES.length - 1; i++) {
    const t0 = SCROLL_TIMES[i];
    const t1 = SCROLL_TIMES[i + 1];
    if (t >= t0 && t <= t1) {
      const p = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return fr[i] + (fr[i + 1] - fr[i]) * easeInOut(p);
    }
  }
  return 1;
}

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

/** Größe der Vorher/Nachher-Karte im Report */
const CARD_W = V4_W - 100;
const CARD_H = 1060;

/**
 * Bild in Kartengröße vorrendern – mit Verschiebung/Zoom und Blur-Rand beim
 * Rauszoomen. Einmal pro Änderung statt in jedem Video-Frame.
 */
function renderCardPanel(img: HTMLImageElement, t: ImageTransform): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawPanel(ctx, img, 0, 0, CARD_W, CARD_H, t);
  return c;
}

/** Spielraum (Karten-px), in dem sich das Bild bei diesem Zoom verschieben lässt */
function panelSlack(img: HTMLImageElement, scale: number) {
  const cover = Math.max(CARD_W / img.width, CARD_H / img.height);
  const f = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  return {
    x: Math.abs(img.width * cover * f - CARD_W) / 2,
    y: Math.abs(img.height * cover * f - CARD_H) / 2,
  };
}

/** Zoom, bei dem das komplette Bild in die Karte passt */
function fitScale(img: HTMLImageElement) {
  const cover = Math.max(CARD_W / img.width, CARD_H / img.height);
  const contain = Math.min(CARD_W / img.width, CARD_H / img.height);
  return Math.max(MIN_SCALE, +(contain / cover).toFixed(2));
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Schneidet das Bild zentriert auf exakt 1024×1536 zu — dasselbe Format, in dem
 * generiert wird. Das Ergebnis wird sowohl an die API geschickt als auch als
 * Vorher angezeigt, damit Vorher und Nachher pixelgenau gleich gerahmt sind.
 */
function cropToGenFormat(img: HTMLImageElement): string {
  const W = 1024;
  const H = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  const s = Math.max(W / img.width, H / img.height);
  const sw = W / s;
  const sh = H / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/** Gleicher Prompt wie in Template 1/2 (Schnitt oder Farbe) */
function buildStylePrompt(style: HairStyle, gender: Gender): string {
  const { noun, possessive, venue } = SUBJECT[gender];
  if (style.kind === "color") {
    return `Recolour the hair of this ${noun} to ${style.name}. ${style.details}. Keep ${possessive} exact haircut, hair length and styling — change only the hair colour. Keep the exact same face, identity, skin tone, expression and background. Photorealistic, natural ${venue} colour result.`;
  }
  return `Give this ${noun} a ${style.name} hairstyle. ${style.details}. Change only the hair — keep the exact same face, identity, skin tone, expression and background. Photorealistic, natural ${venue} result.`;
}

export interface ReportData {
  title: string;
  subtitle: string;
  styleName: string;
  recommendation: string;
  match: string;
  faceShape: string;
  hairType: string;
  maintenance: string;
  brandName: string;
  showBranding: boolean;
}

export interface ReportLayout {
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  scoreX: number;
  scoreY: number;
}

export interface ReportPageResult {
  contentH: number;
  layout: ReportLayout;
  stops: number[];
}

/** Gesperrte Caps wie in der Vorlage ("B E F O R E") */
const sp = (text: string) => text.split("").join(" ");

/**
 * Vorher/Nachher als EIN Bild mit vertikaler Trennlinie (Pillen oben).
 * divFrac = Position der Linie (0..1); bei 0 ist nur das Nachher sichtbar.
 * before/after sind bereits auf Kartengröße gerendert (renderCardPanel).
 */
function drawSplitCard(
  ctx: CanvasRenderingContext2D,
  before: HTMLCanvasElement,
  after: HTMLCanvasElement,
  L: ReportLayout,
  divFrac: number
) {
  const { cardX: x, cardY: y, cardW: w, cardH: h } = L;
  const divX = x + w * divFrac;

  ctx.save();
  rr(ctx, x, y, w, h, 40);
  ctx.clip();
  ctx.drawImage(before, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(divX, y, x + w - divX, h);
  ctx.clip();
  ctx.drawImage(after, x, y, w, h);
  ctx.restore();

  if (divFrac > 0.015) {
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(divX - 3.5, y, 7, h);
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(divX, y + h / 2, 48, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.fillStyle = "#0a0a0a";
    ctx.font = `800 30px ${F}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("‹ ›", divX, y + h / 2 + 2);
  }

  // Labels oben in den Ecken
  const label = (text: string, lx: number, filled: boolean, alignRight: boolean) => {
    ctx.font = `700 26px ${F}`;
    const s = sp(text);
    const tw = ctx.measureText(s).width;
    const pw = tw + 52;
    const ph = 62;
    const bx = alignRight ? lx - pw : lx;
    const by = y + 28;
    rr(ctx, bx, by, pw, ph, ph / 2);
    ctx.fillStyle = filled ? "#ffffff" : "rgba(16,16,16,0.72)";
    ctx.fill();
    ctx.fillStyle = filled ? "#0a0a0a" : "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s, bx + pw / 2, by + ph / 2 + 2);
  };
  if (divFrac > 0.12) label("BEFORE", x + 28, false, false);
  label("AFTER", x + w - 28, true, true);
  ctx.restore();
}

/** Dunkle Karte im App-Look */
function darkCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = "#141414";
  ctx.fill();
  rr(ctx, x, y, w, h, r);
  ctx.strokeStyle = "#262626";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Rendert die statische Report-Seite (dunkles App-UI); Score & Linie pro Frame. */
export function drawReportPage(
  ctx: CanvasRenderingContext2D,
  d: ReportData,
  before: HTMLCanvasElement,
  after: HTMLCanvasElement
): ReportPageResult {
  const W = V4_W;
  const M = 60;
  const CW = W - M * 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 1;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, ctx.canvas.height);

  const sectionLabel = (text: string, y: number) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#8a8a8a";
    ctx.font = `600 27px ${F}`;
    ctx.fillText(sp(text.toUpperCase()), M, y);
  };

  // ── Fake-Statusleiste (Screen-Recording-Look) ────────────────────────────
  ctx.font = `700 30px ${F}`;
  const timeTxt = "9:41";
  const timeW = ctx.measureText(timeTxt).width + 48;
  rr(ctx, M, 44, timeW, 54, 27);
  ctx.fillStyle = "#1e1e1e";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(timeTxt, M + timeW / 2, 73);
  // Signal + Batterie rechts
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 4; i++) {
    const bh = 10 + i * 6;
    ctx.fillRect(W - M - 160 + i * 14, 84 - bh, 8, bh);
  }
  ctx.strokeStyle = "#8a8a8a";
  ctx.lineWidth = 3;
  rr(ctx, W - M - 78, 56, 56, 28, 8);
  ctx.stroke();
  ctx.fillStyle = "#8a8a8a";
  ctx.fillRect(W - M - 18, 64, 6, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(W - M - 73, 61, 36, 18);

  // ── Kopf ────────────────────────────────────────────────────────────────
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 46px ${F}`;
  ctx.fillText(`${d.brandName || "CutG"} Studio`, M, 186);

  // Große Headline + Untertitel, zentriert
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  const titleSize = fitTitle(ctx, d.title, 960, 100);
  ctx.font = `800 ${titleSize}px ${F}`;
  ctx.fillText(d.title, W / 2, 336);
  ctx.fillStyle = "#9a9a9a";
  ctx.font = `500 33px ${F}`;
  ctx.fillText(d.subtitle, W / 2, 422);

  // ── "01 • BEST MATCH" + Download-Kreis ──────────────────────────────────
  const rowY = 546;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 34px ${F}`;
  ctx.fillText("01", M, rowY);
  ctx.fillStyle = "#6b6b6b";
  ctx.fillText("•", M + 78, rowY);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 30px ${F}`;
  ctx.fillText(sp("BEST MATCH"), M + 130, rowY);

  const dcx = W - M - 40;
  ctx.beginPath();
  ctx.arc(dcx, rowY, 40, 0, Math.PI * 2);
  ctx.fillStyle = "#161616";
  ctx.fill();
  ctx.strokeStyle = "#2c2c2c";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(dcx, rowY - 14);
  ctx.lineTo(dcx, rowY + 6);
  ctx.moveTo(dcx - 8, rowY - 2);
  ctx.lineTo(dcx, rowY + 6);
  ctx.lineTo(dcx + 8, rowY - 2);
  ctx.moveTo(dcx - 14, rowY + 16);
  ctx.lineTo(dcx + 14, rowY + 16);
  ctx.stroke();

  // ── Split-Karte ─────────────────────────────────────────────────────────
  const layout: ReportLayout = {
    cardX: 50,
    cardY: 620,
    cardW: CARD_W,
    cardH: CARD_H,
    scoreX: W - M,
    scoreY: 0,
  };
  drawSplitCard(ctx, before, after, layout, 0.5);
  let y = layout.cardY + layout.cardH;

  // ── Name links + Score rechts (Zahl zählt pro Frame hoch) ───────────────
  const nameY = y + 118;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  const nameSize = fitTitle(ctx, d.styleName, 560, 76);
  ctx.font = `800 ${nameSize}px ${F}`;
  ctx.fillText(d.styleName, M, nameY);
  layout.scoreX = W - M;
  layout.scoreY = nameY - 6;
  ctx.textAlign = "right";
  ctx.fillStyle = "#6b6b6b";
  ctx.font = `600 30px ${F}`;
  ctx.fillText("/ 100", W - M, nameY + 74);
  y = nameY + 140;

  // ── Barber Recommendation ───────────────────────────────────────────────
  y += 200;
  const recLabelY = y;
  sectionLabel("Barber Recommendation", y);
  y += 46;
  const P = 56;
  ctx.font = `500 36px ${F}`;
  const recLines = wrapText(ctx, d.recommendation, CW - P * 2);
  const recCardH = P + 60 + 30 + recLines.length * 56 + P;
  darkCard(ctx, M, y, CW, recCardH, 28);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 48px ${F}`;
  ctx.fillText(d.styleName, M + P, y + P + 24);
  ctx.fillStyle = "#b5b5b5";
  ctx.font = `500 36px ${F}`;
  recLines.forEach((line, i) => {
    ctx.fillText(line, M + P, y + P + 60 + 30 + i * 56 + 18);
  });
  y += recCardH;

  // ── Details ─────────────────────────────────────────────────────────────
  y += 200;
  const detailsLabelY = y;
  sectionLabel("Details", y);
  y += 46;
  const rows: [string, string][] = [
    ["STYLE", d.styleName],
    ["FACE SHAPE", d.faceShape],
    ["HAIR TYPE", d.hairType],
    ["MAINTENANCE", d.maintenance],
  ];
  const rowH = 128;
  darkCard(ctx, M, y, CW, rows.length * rowH, 28);
  rows.forEach(([k, v], i) => {
    const ry = y + i * rowH + rowH / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = "#8a8a8a";
    ctx.font = `600 25px ${F}`;
    ctx.fillText(sp(k), M + P, ry);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 34px ${F}`;
    ctx.fillText(v, M + CW - P, ry);
    if (i < rows.length - 1) {
      ctx.fillStyle = "#222222";
      ctx.fillRect(M + P, y + (i + 1) * rowH, CW - P * 2, 2);
    }
  });
  y += rows.length * rowH;

  // Fußzeile
  if (d.showBranding) {
    y += 150;
    ctx.fillStyle = "#6b6b6b";
    ctx.font = `500 28px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText(`made with ${d.brandName || "CutG"} ✂`, W / 2, y);
  }
  y += 420;

  const contentH = y;
  const maxScroll = Math.max(1, contentH - V4_H);
  const clampStop = (v: number) => clamp01(v / maxScroll);
  const stops = [
    clampStop(layout.cardY + layout.cardH / 2 - V4_H * 0.52),
    clampStop(recLabelY - 420),
    clampStop(detailsLabelY - 420),
  ];

  return { contentH, layout, stops };
}

function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number
): number {
  let size = startPx;
  ctx.font = `800 ${size}px ${F}`;
  while (size > 34 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `800 ${size}px ${F}`;
  }
  return size;
}

export interface FrameAssets {
  page: HTMLCanvasElement;
  contentH: number;
  before: HTMLCanvasElement;
  after: HTMLCanvasElement;
  layout: ReportLayout;
  stops: number[];
}

/** Ein Video-Frame: Seite + animierte Trennlinie + Match-Ring + Overlays. */
export function drawReport4Frame(
  ctx: CanvasRenderingContext2D,
  t: number,
  assets: FrameAssets,
  d: { brandName: string; match: string }
) {
  const { page, contentH, before, after, layout, stops } = assets;
  const maxScroll = Math.max(0, contentH - V4_H);
  const sy = maxScroll * scrollFrac(t, stops);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, V4_W, V4_H);

  // Sanfter Zoom-Settle beim Einblenden nach dem Ladescreen
  const settle = clamp01((t - LOAD_END) / 0.9);
  const s = 1 + 0.035 * (1 - easeOutCubic(settle));
  ctx.save();
  ctx.translate(V4_W / 2, V4_H / 2);
  ctx.scale(s, s);
  ctx.translate(-V4_W / 2, -V4_H / 2);
  ctx.drawImage(page, 0, sy, V4_W, V4_H, 0, 0, V4_W, V4_H);

  // ── Animierte Trennlinie: schneller Voll-Sweep, endet auf "nur Nachher" ──
  const cardScreenY = layout.cardY - sy;
  if (cardScreenY < V4_H && cardScreenY + layout.cardH > 0) {
    // Sweep startet erst, wenn der Ladescreen komplett weg ist (3,2 s) und
    // läuft langsam genug, dass die Links-rechts-Bewegung klar sichtbar ist.
    let divFrac: number;
    if (t < 3.6) divFrac = 0.5;
    else if (t < 4.5) divFrac = 0.5 + 0.46 * easeInOut((t - 3.6) / 0.9);
    else if (t < 5.7) divFrac = 0.96 * (1 - easeInOut((t - 4.5) / 1.2));
    else divFrac = 0;
    drawSplitCard(ctx, before, after, { ...layout, cardY: cardScreenY }, divFrac);
  }

  // ── Score: große Zahl zählt hoch (rechts neben dem Style-Namen) ─────────
  const scoreScreenY = layout.scoreY - sy;
  if (scoreScreenY > -180 && scoreScreenY < V4_H + 180) {
    const target = Math.max(0, Math.min(100, parseInt(d.match || "98", 10) || 98));
    const p = easeInOut(clamp01((t - 3.4) / 1.2));
    const val = Math.round(target * p);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 130px ${F}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${val}`, layout.scoreX, scoreScreenY);
  }
  ctx.restore();

  // ── Ladescreen: komplett weiß, Logo + Ringe + Status + Fortschritt ──────
  if (t < UNBLUR_END) {
    const fade = t < LOAD_END ? 1 : clamp01(1 - (t - LOAD_END) / (UNBLUR_END - LOAD_END));
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, V4_W, V4_H);

    const cx = V4_W / 2;
    const cy = 860;

    // Ring-Spur + zwei rotierende Bögen
    ctx.strokeStyle = "rgba(10,10,10,0.10)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 124, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineCap = "round";
    ctx.beginPath();
    const a0 = t * 4.4;
    ctx.arc(cx, cy, 124, a0, a0 + Math.PI * 1.3);
    ctx.stroke();
    ctx.strokeStyle = "rgba(10,10,10,0.28)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    const a1 = -t * 2.6;
    ctx.arc(cx, cy, 148, a1, a1 + Math.PI * 0.8);
    ctx.stroke();

    // Logo: atmet leicht, weicher Schatten
    const breathe = 1 + 0.015 * Math.sin(t * 3.2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(breathe, breathe);
    ctx.shadowColor = "rgba(10,10,10,0.25)";
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 12;
    rr(ctx, -70, -70, 140, 140, 36);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 70px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText("✂", 0, 4);
    ctx.restore();

    // Marke
    ctx.fillStyle = "#0a0a0a";
    ctx.font = `800 66px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText(d.brandName || "CutG", cx, cy + 244);

    // Wechselnde Status-Texte (weich einblendend)
    const steps = [
      "Analyzing your photos",
      "Matching face shape",
      "Finding your cut",
      "Report ready ✓",
    ];
    const stepDur = 0.72;
    const idx = Math.min(steps.length - 1, Math.floor(t / stepDur));
    const stepP = clamp01((t - idx * stepDur) / 0.25);
    ctx.globalAlpha = fade * (0.3 + 0.7 * stepP);
    ctx.fillStyle = "#525252";
    ctx.font = `500 34px ${F}`;
    ctx.fillText(steps[idx], cx, cy + 316);
    ctx.globalAlpha = fade;

    // Fortschritt + Prozent
    const p = easeInOut(clamp01(t / LOAD_END));
    const lw = 440;
    const lx = cx - lw / 2;
    const ly = cy + 386;
    rr(ctx, lx, ly, lw, 8, 4);
    ctx.fillStyle = "#ececec";
    ctx.fill();
    if (p > 0) {
      rr(ctx, lx, ly, Math.max(8, lw * p), 8, 4);
      ctx.fillStyle = "#0a0a0a";
      ctx.fill();
    }
    ctx.font = `700 30px ${F}`;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillText(`${Math.round(p * 100)}%`, cx, ly + 62);

    ctx.globalAlpha = 1;
  }
}

export default function VideoTemplate4({
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
  const [before, setBefore] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [after, setAfter] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const genCancelRef = useRef(false);
  const [styleName, setStyleName] = useState("");
  const [title, setTitle] = useState("Your Perfect Cut.");
  const [subtitle, setSubtitle] = useState("AI-matched to your face shape and hair");
  const [recommendation, setRecommendation] = useState("");
  const [match, setMatch] = useState("98");
  const [faceShape, setFaceShape] = useState("Oval");
  const [hairType, setHairType] = useState("Thick");
  const [maintenance, setMaintenance] = useState("Low");
  const [exporting, setExporting] = useState(false);
  const [video, setVideo] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [framing, setFraming] = useState<Record<PhotoSlot, ImageTransform>>({
    before: { ...DEFAULT_TRANSFORM },
    after: { ...DEFAULT_TRANSFORM },
  });
  // Generiertes Nachher ist exakt wie das Vorher gerahmt → standardmäßig gekoppelt
  const [linked, setLinked] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ slot: PhotoSlot; lastX: number; lastY: number } | null>(null);
  const exportingRef = useRef(false);
  const assetsRef = useRef<FrameAssets | null>(null);
  const frameDataRef = useRef({ brandName, match });
  const recTouched = useRef(false);

  frameDataRef.current = { brandName, match };

  const allStyles: HairStyle[] = groups.flatMap((g) => g.cuts);

  useEffect(() => {
    if (styleName && !allStyles.some((s) => s.name === styleName)) setStyleName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

  const onStyleChange = (name: string) => {
    setStyleName(name);
    if (!recTouched.current) {
      const s = allStyles.find((x) => x.name === name);
      setRecommendation(s ? `Ask your barber for a ${s.name}: ${s.details}.` : "");
    }
  };

  const ready = !!before && !!after && !!styleName;

  const beforePanel = useMemo(
    () => (before ? renderCardPanel(before.img, framing.before) : null),
    [before, framing.before]
  );
  const afterPanel = useMemo(
    () => (after ? renderCardPanel(after.img, framing.after) : null),
    [after, framing.after]
  );

  // Rahmen-Editor: statische Karte mit Trennlinie in der Mitte
  useEffect(() => {
    const canvas = editorRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !beforePanel || !afterPanel) return;
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    drawSplitCard(
      ctx,
      beforePanel,
      afterPanel,
      { cardX: 0, cardY: 0, cardW: CARD_W, cardH: CARD_H, scoreX: 0, scoreY: 0 },
      0.5
    );
  }, [beforePanel, afterPanel]);

  // Report-Seite (Offscreen) neu bauen, wenn sich Inhalte ändern
  useEffect(() => {
    if (!beforePanel || !afterPanel || !styleName) {
      assetsRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      await ensureFonts();
      if (cancelled) return;
      const page = document.createElement("canvas");
      page.width = V4_W;
      page.height = 4400;
      const pctx = page.getContext("2d");
      if (!pctx) return;
      const result = drawReportPage(
        pctx,
        {
          title,
          subtitle,
          styleName,
          recommendation:
            recommendation.trim() || `Ask your barber for a ${styleName}.`,
          match,
          faceShape,
          hairType,
          maintenance,
          brandName,
          showBranding,
        },
        beforePanel,
        afterPanel
      );
      assetsRef.current = {
        page,
        contentH: result.contentH,
        before: beforePanel,
        after: afterPanel,
        layout: result.layout,
        stops: result.stops,
      };
      setAssetsVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    beforePanel,
    afterPanel,
    styleName,
    title,
    subtitle,
    recommendation,
    match,
    faceShape,
    hairType,
    maintenance,
    brandName,
    showBranding,
  ]);

  // Live-Vorschau in Dauerschleife
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      if (!exportingRef.current && assetsRef.current) {
        const t = ((performance.now() - t0) / 1000) % (V4_DURATION + 0.8);
        drawReport4Frame(ctx, Math.min(t, V4_DURATION), assetsRef.current, frameDataRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, assetsVersion]);

  const setFile = async (
    which: "before" | "after",
    file: File | null
  ): Promise<void> => {
    setError(null);
    setVideo(null);
    const setter = which === "before" ? setBefore : setAfter;
    if (!file) {
      setter(null);
      return;
    }
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = await loadImage(src);
    setter({ src, img });
    // Neues Bild → Ausschnitt zurücksetzen (gekoppelt: beide)
    setFraming((f) =>
      linked
        ? { before: { ...DEFAULT_TRANSFORM }, after: { ...DEFAULT_TRANSFORM } }
        : { ...f, [which]: { ...DEFAULT_TRANSFORM } }
    );
  };

  /** Ausschnitt ändern – gekoppelt für Vorher und Nachher zugleich */
  const updateFraming = (slot: PhotoSlot, fn: (t: ImageTransform) => ImageTransform) =>
    setFraming((f) => {
      const next = fn(f[slot]);
      return linked ? { before: next, after: { ...next } } : { ...f, [slot]: next };
    });

  const setZoom = (slot: PhotoSlot, scale: number) =>
    updateFraming(slot, (t) => ({ ...t, scale: clamp(+scale.toFixed(2), MIN_SCALE, MAX_SCALE) }));

  const fitWhole = (slot: PhotoSlot) => {
    const photo = slot === "before" ? before : after;
    if (photo) updateFraming(slot, () => ({ ...DEFAULT_TRANSFORM, scale: fitScale(photo.img) }));
  };

  const toggleLinked = (on: boolean) => {
    setLinked(on);
    if (on) setFraming((f) => ({ before: f.before, after: { ...f.before } }));
  };

  const onFrameDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const slot: PhotoSlot =
      linked || e.clientX - rect.left < rect.width / 2 ? "before" : "after";
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { slot, lastX: e.clientX, lastY: e.clientY };
  };

  const onFrameMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const photo = drag && (drag.slot === "before" ? before : after);
    if (!drag || !photo) return;
    // Bildschirm-px → Karten-px, damit das Bild genau unter dem Finger bleibt
    const k = CARD_W / e.currentTarget.getBoundingClientRect().width;
    const dx = (e.clientX - drag.lastX) * k;
    const dy = (e.clientY - drag.lastY) * k;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    updateFraming(drag.slot, (t) => {
      const slack = panelSlack(photo.img, t.scale);
      return {
        ...t,
        offsetX: slack.x ? clamp(t.offsetX - dx / slack.x, -1, 1) : t.offsetX,
        offsetY: slack.y ? clamp(t.offsetY + dy / slack.y, -1, 1) : t.offsetY,
      };
    });
  };

  const endFrameDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
  };

  // Cmd/Ctrl+V füllt die leeren Slots der Reihe nach: erst Vorher, dann Nachher
  usePasteImages((files) => {
    const queue = [...files];
    if (!before && queue.length) setFile("before", queue.shift()!);
    if (!after && !generating && queue.length) setFile("after", queue.shift()!);
  });

  /** Nachher-Bild einzeln sichern – wird wie jeder Download protokolliert. */
  const saveAfter = () => {
    if (!after) return;
    const type = /^data:image\/(\w+)/.exec(after.src)?.[1] ?? "png";
    const ext = type === "jpeg" ? "jpg" : type;
    const filename = `cutg-after-${(styleName || "image").replace(/\s+/g, "-").toLowerCase()}.${ext}`;
    logEvent("download", 1, { filename, kind: "after" });
    saveImage(after.src, filename);
  };

  /** Nachher-Bild automatisch generieren (läuft über die normale Job-Queue). */
  const generateAfter = async () => {
    if (!before || !styleName || generating) return;
    const style = allStyles.find((s) => s.name === styleName);
    if (!style) return;
    setGenError(null);
    setGenerating(true);
    genCancelRef.current = false;
    let jobId: string | null = null;
    try {
      const croppedSrc = cropToGenFormat(before.img);
      const croppedImg = await loadImage(croppedSrc);
      const items = [
        {
          idx: 0,
          style: styleName,
          prompt:
            buildStylePrompt(style, gender) +
            " Do not crop, zoom, shift or reframe the image — keep the exact same camera framing, head position and composition as the input; only the hair changes.",
          size: "1024x1536",
        },
      ];
      try {
        jobId = await rpc<string>("mkt_create_job", {
          p_items: items,
          p_mode: "t4",
          p_gender: gender,
          p_shared_image: croppedSrc,
        });
      } catch {
        // Falls die DB nur t1/t2 als Mode kennt: einmal mit t2 wiederholen
        jobId = await rpc<string>("mkt_create_job", {
          p_items: items,
          p_mode: "t2",
          p_gender: gender,
          p_shared_image: croppedSrc,
        });
      }
      // Ab jetzt ist der Zuschnitt die Referenz — als Vorher anzeigen,
      // damit Vorher und Nachher exakt gleich gerahmt sind.
      setBefore({ src: croppedSrc, img: croppedImg });
      for (;;) {
        if (genCancelRef.current) {
          if (jobId) rpc("mkt_delete_job", { p_job: jobId }).catch(() => {});
          return;
        }
        await sleep(3000);
        const st = await rpc<{
          items: { status: string; error: string | null }[];
        } | null>("mkt_get_job", { p_job: jobId }).catch(() => null);
        const item = st?.items?.[0];
        if (item?.status === "done") {
          const r = await rpc<{ result: string | null } | null>("mkt_get_result", {
            p_job: jobId,
            p_idx: 0,
          });
          if (!r?.result) throw new Error("No image data received");
          const genImg = await loadImage(r.result);
          setAfter({ src: r.result, img: genImg });
          return;
        }
        if (item?.status === "error") {
          throw new Error(item.error || "Generation failed");
        }
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const exportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || !assetsRef.current || exporting) return;
    setError(null);
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
    setExporting(true);
    exportingRef.current = true;
    try {
      await ensureFonts();
      const ctx = canvas.getContext("2d")!;
      const { blob, ext } = await recordCanvasVideo(canvas, V4_DURATION, (t) =>
        drawReport4Frame(ctx, t, assetsRef.current!, frameDataRef.current)
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
    const filename = `cutg-report-${styleName.replace(/\s+/g, "-").toLowerCase()}.${video.ext}`;
    logEvent("download", 1, { filename, kind: "video" });
    saveVideoBlob(video.blob, filename);
  };

  const uploadSlot = (
    which: "before" | "after",
    label: string,
    value: { src: string } | null
  ) => (
    <div>
      <span className="mb-2 block text-xs text-ink-faint">{label}</span>
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value.src} alt="" className="h-20 w-20 rounded-lg object-cover" />
          <button
            type="button"
            className="text-xs text-ink-faint hover:text-ink hover:underline"
            onClick={() => setFile(which, null)}
          >
            remove
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-paper-border bg-paper-warm px-4 py-8 text-center text-sm font-medium text-ink transition hover:border-ink hover:bg-white">
          + Add image
          <span className="mt-1 hidden text-xs font-normal text-ink-faint sm:block">
            or paste with {PASTE_SHORTCUT}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setFile(which, e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          1 · Add before & after photos
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Blurred loading screen with {brandName || "CutG"} → the report scrolls
          through: old hair left, new hair right, then your barber recommendation.
          No AI — everything below is yours to edit.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {uploadSlot("before", "Before (old hair)", before)}
          <div>
            <span className="mb-2 block text-xs text-ink-faint">After (new hair)</span>
            {after ? (
              <div className="flex items-center gap-3">
                <img src={after.src} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button type="button" className="btn-secondary text-xs" onClick={saveAfter}>
                  Save image
                </button>
                <button
                  type="button"
                  className="text-xs text-ink-faint hover:text-ink hover:underline"
                  onClick={() => setFile("after", null)}
                >
                  remove
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  className="btn-primary w-full py-3 text-sm"
                  disabled={!before || !styleName || generating}
                  onClick={generateAfter}
                >
                  {generating
                    ? "Generating after…"
                    : !before
                      ? "Add the before photo first"
                      : !styleName
                        ? "Pick a hairstyle first"
                        : "✨ Generate after (1 generation)"}
                </button>
                {generating && (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-red-300 bg-white py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                    onClick={() => (genCancelRef.current = true)}
                  >
                    Cancel
                  </button>
                )}
                <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-paper-border bg-paper-warm px-4 py-3 text-center text-xs font-medium text-ink-muted transition hover:border-ink hover:bg-white">
                  …or upload your own
                  <span className="hidden sm:inline">&nbsp;· paste with {PASTE_SHORTCUT}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setFile("after", e.target.files?.[0] ?? null)}
                  />
                </label>
                {genError && <p className="text-xs text-red-600">{genError}</p>}
              </div>
            )}
          </div>
        </div>

        {before && after && (
          <div className="mt-6 border-t border-paper-border pt-6">
            <h3 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
              Adjust framing
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Drag the image to reposition · zoom out to show the whole photo (the edges
              get a blurred fill).
            </p>
            <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
              <canvas
                ref={editorRef}
                width={CARD_W}
                height={CARD_H}
                onPointerDown={onFrameDown}
                onPointerMove={onFrameMove}
                onPointerUp={endFrameDrag}
                onPointerCancel={endFrameDrag}
                className="mx-auto block w-full max-w-[280px] shrink-0 cursor-grab touch-none active:cursor-grabbing sm:mx-0"
              />
              <div className="min-w-0 flex-1 space-y-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={linked}
                    onChange={(e) => toggleLinked(e.target.checked)}
                    className="h-4 w-4 rounded border-paper-border accent-ink"
                  />
                  <span className="text-sm text-ink-muted">Same framing for before & after</span>
                </label>
                {(linked
                  ? ([["before", "Before & after"]] as const)
                  : ([
                      ["before", "Before"],
                      ["after", "After"],
                    ] as const)
                ).map(([slot, label]) => (
                  <div key={slot}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                        {label} · zoom
                      </span>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                          onClick={() => fitWhole(slot)}
                        >
                          show whole image
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
                          onClick={() => updateFraming(slot, () => ({ ...DEFAULT_TRANSFORM }))}
                        >
                          reset
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`zoom out ${slot}`}
                        className="zoom-btn"
                        onClick={() => setZoom(slot, framing[slot].scale - 0.15)}
                        disabled={framing[slot].scale <= MIN_SCALE}
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min={MIN_SCALE}
                        max={MAX_SCALE}
                        step={0.01}
                        value={framing[slot].scale}
                        onChange={(e) => setZoom(slot, Number(e.target.value))}
                        className="range-lg min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        aria-label={`zoom in ${slot}`}
                        className="zoom-btn"
                        onClick={() => setZoom(slot, framing[slot].scale + 0.15)}
                        disabled={framing[slot].scale >= MAX_SCALE}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
                {!linked && (
                  <p className="text-xs text-ink-faint">
                    Drag on the left half to move the before photo, on the right half for the
                    after photo.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel p-6">
        <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          2 · Report content
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-faint">Hairstyle</label>
            <select
              className="input-field py-2.5"
              value={styleName}
              onChange={(e) => onStyleChange(e.target.value)}
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
            <label className="mb-1 block text-xs text-ink-faint">Headline</label>
            <input
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-faint">Subtitle</label>
            <input
              className="input-field"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-ink-faint">
              Barber recommendation
            </label>
            <textarea
              className="input-field min-h-24 resize-y"
              value={recommendation}
              onChange={(e) => {
                recTouched.current = true;
                setRecommendation(e.target.value);
              }}
              placeholder="What should the barber do? (auto-filled when you pick a style)"
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
          <div>
            <label className="mb-1 block text-xs text-ink-faint">Hair type</label>
            <input
              className="input-field"
              value={hairType}
              onChange={(e) => setHairType(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-faint">Maintenance</label>
            <input
              className="input-field"
              value={maintenance}
              onChange={(e) => setMaintenance(e.target.value)}
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
            Preview ({V4_DURATION}s · 1080×1920)
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
              width={V4_W}
              height={V4_H}
              className="block w-full rounded-lg border border-paper-border"
            />
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-10 text-center">
            <p className="text-sm font-medium text-ink-muted">your report video appears here</p>
            <p className="mt-2 text-xs text-ink-faint">
              add both photos and pick a hairstyle · the preview loops automatically
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
        {exporting ? `Recording video… (${V4_DURATION}s)` : "Export video"}
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
