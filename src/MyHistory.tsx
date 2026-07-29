import { useEffect, useState } from "react";
import { HistoryList } from "./history";
import { rpc, type HistoryEntry, type Profile } from "./session";

/**
 * Eigener Verlauf – ausschließlich lesend. Es gibt keine Lösch-Funktion,
 * weder hier noch serverseitig: der Verlauf gehört dem Admin.
 */
export default function MyHistory({ profile }: { profile: Profile }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc<HistoryEntry[]>("mkt_my_history", { p_limit: 200 })
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="brand-text text-xl">My history</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {profile.used_total} generations in total · {profile.used_this_month} this
            month
            {profile.monthly_limit !== null && ` (limit ${profile.monthly_limit})`}
          </p>
        </div>
        <a href="#" className="btn-secondary text-xs">
          ← back to the studio
        </a>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="panel px-6 py-2">
        {entries === null && !error ? (
          <p className="py-8 text-center text-sm text-ink-faint">Loading…</p>
        ) : (
          <HistoryList entries={entries ?? []} />
        )}
      </div>
    </div>
  );
}
