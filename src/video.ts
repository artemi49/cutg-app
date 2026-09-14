/** Gemeinsame Video-Helfer für die Video-Templates (Aufnahme + Speichern). */

export function pickVideoMime(): string | null {
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  return (
    candidates.find(
      (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
    ) ?? null
  );
}

/** Nimmt das Canvas in Echtzeit auf, während draw(t) die Frames zeichnet. */
export async function recordCanvasVideo(
  canvas: HTMLCanvasElement,
  duration: number,
  draw: (t: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const mime = pickVideoMime();
  if (!mime) throw new Error("Video recording is not supported in this browser.");

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
  });

  draw(0);
  rec.start(250);

  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      draw(Math.min(t, duration));
      if (t >= duration + 0.2) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  rec.stop();
  const blob = await finished;
  return { blob, ext: mime.includes("mp4") ? "mp4" : "webm" };
}

/** Video speichern: mobil übers Teilen-Menü (Galerie), sonst Download. */
export async function saveVideoBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type || "video/mp4" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[] }) => Promise<void>;
  };
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
