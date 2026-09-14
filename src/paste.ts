import { useEffect, useRef } from "react";

/** Tastenkürzel für den Hinweistext – Mac zeigt ⌘V, alles andere Ctrl+V. */
export const PASTE_SHORTCUT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? "⌘V"
    : "Ctrl+V";

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA";
}

/** Bilder aus der Zwischenablage (Screenshot, „Bild kopieren", Datei aus dem Finder). */
function clipboardImages(data: DataTransfer): File[] {
  const fromFiles = Array.from(data.files).filter((f) => f.type.startsWith("image/"));
  if (fromFiles.length) return fromFiles;
  return Array.from(data.items)
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f);
}

/**
 * Cmd/Ctrl+V überall auf der Seite: eingefügte Bilder gehen an onImages.
 * Text-Einfügen in Eingabefeldern bleibt unangetastet.
 */
export function usePasteImages(onImages: (files: File[]) => void, enabled = true) {
  const handler = useRef(onImages);
  handler.current = onImages;

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      if (isEditable(e.target) && e.clipboardData.types.includes("text/plain")) return;
      const files = clipboardImages(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      handler.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled]);
}
