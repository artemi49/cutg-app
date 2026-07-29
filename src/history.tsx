import { useEffect, useState } from "react";
import { archiveUrl, type HistoryEntry } from "./session";

/** Bewusst mit ausgeschriebenem Monat – „07/03" wäre je nach Leser mehrdeutig. */
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Archivbild aus dem privaten Bucket – die Signatur wird erst beim Rendern geholt. */
function ArchiveThumb({ path, alt }: { path: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    archiveUrl(path)
      .then((u) => alive && (u ? setUrl(u) : setFailed(true)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);

  if (!path || failed)
    return (
      <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-paper-border text-[10px] text-ink-faint">
        —
      </div>
    );
  if (!url)
    return <div className="h-20 w-16 shrink-0 animate-pulse rounded-lg bg-paper-warm" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
      <img
        src={url}
        alt={alt}
        className="h-20 w-16 rounded-lg border border-paper-border object-cover"
      />
    </a>
  );
}

const MODE_LABEL: Record<string, string> = { t1: "Template 1", t2: "Template 2" };

export function HistoryList({
  entries,
  showUser = false,
}: {
  entries: HistoryEntry[];
  showUser?: boolean;
}) {
  if (entries.length === 0)
    return <p className="py-8 text-center text-sm text-ink-faint">Nothing generated yet.</p>;

  return (
    <ul className="divide-y divide-paper-border">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center gap-4 py-3">
          <ArchiveThumb path={e.before_path} alt="Before" />
          <ArchiveThumb path={e.after_path} alt="After" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{e.style}</p>
            <p className="mt-0.5 text-xs text-ink-faint">
              {fmt(e.created_at)}
              {showUser && e.username ? ` · ${e.username}` : ""}
              {e.mode ? ` · ${MODE_LABEL[e.mode] ?? e.mode}` : ""}
              {e.gender ? ` · ${e.gender === "men" ? "Men" : "Women"}` : ""}
            </p>
            {e.status === "error" && (
              <p className="mt-0.5 truncate text-xs text-red-600" title={e.error ?? ""}>
                Error: {e.error ?? "unknown"}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              e.status === "done"
                ? "bg-ink text-white"
                : e.status === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-paper-warm text-ink-muted"
            }`}
          >
            {e.status === "done" ? "done" : e.status === "error" ? "error" : e.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
