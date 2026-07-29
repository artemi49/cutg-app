import { useCallback, useEffect, useMemo, useState } from "react";
import { HistoryList } from "./history";
import {
  adminCall,
  rpc,
  signOut,
  type ClipperRow,
  type HistoryEntry,
  type Profile,
} from "./session";

type Tab = "clippers" | "history" | "activity";

interface EventRow {
  id: number;
  created_at: string;
  kind: string;
  amount: number;
  meta: Record<string, unknown>;
  username: string;
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Vorschlag für ein leicht weitergebbares Passwort. */
function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function AdminPanel({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>("clippers");
  const [clippers, setClippers] = useState<ClipperRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadClippers = useCallback(async () => {
    try {
      setClippers(await rpc<ClipperRow[]>("mkt_admin_clippers"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClippers();
  }, [loadClippers]);

  const totals = useMemo(
    () =>
      clippers.reduce(
        (acc, c) => ({
          month: acc.month + c.gen_month,
          total: acc.total + c.gen_total,
          week: acc.week + c.gen_7d,
          active: acc.active + (c.active ? 1 : 0),
        }),
        { month: 0, total: 0, week: 0, active: 0 }
      ),
    [clippers]
  );

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="brand-text text-xl">Admin · CutG Studio</h1>
          <p className="mt-1 text-sm text-ink-muted">signed in as {profile.username}</p>
        </div>
        <div className="flex gap-2">
          <a href="#" className="btn-secondary text-xs">
            ← Studio
          </a>
          <button type="button" className="btn-secondary text-xs" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Generations total" value={totals.total} />
        <StatCard label="This month" value={totals.month} />
        <StatCard label="Last 7 days" value={totals.week} />
        <StatCard label="Active clippers" value={totals.active} />
      </div>

      <div className="mb-6 flex gap-2">
        {(
          [
            ["clippers", "Clippers & usage"],
            ["history", "History"],
            ["activity", "Activity"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? "border-ink bg-ink text-white"
                : "border-paper-border bg-white text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === "clippers" && (
        <ClipperTab
          clippers={clippers}
          loading={loading}
          me={profile}
          onChanged={loadClippers}
          onError={setError}
        />
      )}
      {tab === "history" && <HistoryTab clippers={clippers} />}
      {tab === "activity" && <EventsTab clippers={clippers} />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-widest text-ink-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Clipper-Tab

function ClipperTab({
  clippers,
  loading,
  me,
  onChanged,
  onError,
}: {
  clippers: ClipperRow[];
  loading: boolean;
  me: Profile;
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const guard = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    onError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = (c: ClipperRow) =>
    guard(c.user_id, () =>
      rpc("mkt_admin_update_clipper", { p_user: c.user_id, p_active: !c.active })
    );

  const changeLimit = (c: ClipperRow) => {
    const input = window.prompt(
      `Monthly limit for “${c.username}” (empty = no limit):`,
      c.monthly_limit === null ? "" : String(c.monthly_limit)
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (trimmed === "")
      return guard(c.user_id, () =>
        rpc("mkt_admin_update_clipper", { p_user: c.user_id, p_clear_limit: true })
      );
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 1) return onError("Limit must be a number of 1 or more.");
    return guard(c.user_id, () =>
      rpc("mkt_admin_update_clipper", {
        p_user: c.user_id,
        p_monthly_limit: Math.floor(n),
      })
    );
  };

  const resetPassword = (c: ClipperRow) => {
    const pw = suggestPassword();
    if (
      !window.confirm(
        `Set a new password for “${c.username}”?\n\n${pw}\n\n` +
          "After OK the old password stops working. Copy the new one now."
      )
    )
      return;
    return guard(c.user_id, async () => {
      await adminCall("reset_password", { user_id: c.user_id, password: pw });
      window.prompt(`New password for ${c.username} — copy it now:`, pw);
    });
  };

  return (
    <div className="space-y-6">
      <CreateAccountForm onCreated={onChanged} onError={onError} />

      <div className="panel overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-paper-border text-xs uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3 text-right">Month</th>
              <th className="px-4 py-3 text-right">7 days</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Errors</th>
              <th className="px-4 py-3 text-right">Downloads</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-faint">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && clippers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-faint">
                  No accounts yet.
                </td>
              </tr>
            )}
            {clippers.map((c) => {
              const overLimit =
                c.monthly_limit !== null && c.gen_month >= c.monthly_limit;
              return (
                <tr key={c.user_id} className={c.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{c.username}</span>
                    {c.role === "admin" && (
                      <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                        Admin
                      </span>
                    )}
                    {!c.active && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
                        blocked
                      </span>
                    )}
                    {c.display_name && (
                      <span className="block text-xs text-ink-faint">{c.display_name}</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      overLimit ? "font-semibold text-red-600" : ""
                    }`}
                  >
                    {c.gen_month}
                    {c.monthly_limit !== null && (
                      <span className="text-ink-faint"> / {c.monthly_limit}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.gen_7d}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.gen_total}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-faint">
                    {c.gen_failed}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.downloads}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {fmtDate(c.last_active)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-xs text-ink-faint hover:text-ink hover:underline disabled:opacity-40"
                        disabled={busyId === c.user_id}
                        onClick={() => changeLimit(c)}
                      >
                        Limit
                      </button>
                      <button
                        type="button"
                        className="text-xs text-ink-faint hover:text-ink hover:underline disabled:opacity-40"
                        disabled={busyId === c.user_id}
                        onClick={() => resetPassword(c)}
                      >
                        Password
                      </button>
                      {c.user_id !== me.user_id && (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline disabled:opacity-40"
                          disabled={busyId === c.user_id}
                          onClick={() => toggleActive(c)}
                        >
                          {c.active ? "block" : "unblock"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateAccountForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(suggestPassword);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(
    null
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await adminCall("create", {
        username: username.trim().toLowerCase(),
        password,
        monthly_limit: limit.trim() === "" ? null : Number(limit),
      });
      setCreated({ username: username.trim().toLowerCase(), password });
      setUsername("");
      setPassword(suggestPassword());
      setLimit("");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const credentials = created
    ? `CutG Studio\n${window.location.origin}\n\nUsername: ${created.username}\nPassword: ${created.password}`
    : "";

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-widest text-ink-faint">
          Create a clipper account
        </h2>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "close" : "+ Account"}
        </button>
      </div>

      {created && (
        <div className="mt-4 rounded-xl border border-paper-border bg-paper-warm p-4">
          <p className="text-xs uppercase tracking-widest text-ink-faint">
            Credentials — pass them on now, the password is not shown again
          </p>
          <pre className="mt-2 whitespace-pre-wrap break-all text-sm text-ink">
            {credentials}
          </pre>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => navigator.clipboard?.writeText(credentials)}
            >
              Copy
            </button>
            <button
              type="button"
              className="text-xs text-ink-faint hover:text-ink hover:underline"
              onClick={() => setCreated(null)}
            >
              hide
            </button>
          </div>
        </div>
      )}

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs text-ink-faint">Username</span>
            <input
              className="input-field mt-1"
              value={username}
              autoCapitalize="none"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="marco"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-faint">Password</span>
            <div className="mt-1 flex gap-2">
              <input
                className="input-field flex-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary shrink-0 text-xs"
                onClick={() => setPassword(suggestPassword())}
              >
                new
              </button>
            </div>
          </label>
          <label className="block">
            <span className="text-xs text-ink-faint">Monthly limit (empty = none)</span>
            <input
              className="input-field mt-1"
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 200"
            />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="btn-primary w-full py-3 text-sm"
              disabled={busy || username.trim().length < 3 || password.length < 8}
            >
              {busy ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Verlauf-Tab

function ClipperFilter({
  clippers,
  value,
  onChange,
}: {
  clippers: ClipperRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="input-field w-56 py-2"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All clippers</option>
      {clippers.map((c) => (
        <option key={c.user_id} value={c.user_id}>
          {c.username}
        </option>
      ))}
    </select>
  );
}

function HistoryTab({ clippers }: { clippers: ClipperRow[] }) {
  const [user, setUser] = useState("");
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    setEntries(null);
    rpc<HistoryEntry[]>("mkt_admin_history", {
      p_user: user || null,
      p_limit: limit,
    })
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [user, limit]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ClipperFilter clippers={clippers} value={user} onChange={setUser} />
        <span className="text-xs text-ink-faint">
          Complete history — clippers cannot remove anything here.
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="panel px-6 py-2">
        {entries === null && !error ? (
          <p className="py-8 text-center text-sm text-ink-faint">Loading…</p>
        ) : (
          <HistoryList entries={entries ?? []} showUser />
        )}
      </div>
      {entries && entries.length >= limit && (
        <button
          type="button"
          className="btn-secondary w-full py-2.5 text-xs"
          onClick={() => setLimit((l) => Math.min(300, l + 60))}
        >
          Load more
        </button>
      )}
    </div>
  );
}

// -------------------------------------------------------------- Aktivitäts-Tab

function EventsTab({ clippers }: { clippers: ClipperRow[] }) {
  const [user, setUser] = useState("");
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEvents(null);
    rpc<EventRow[]>("mkt_admin_events", { p_user: user || null, p_limit: 200 })
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [user]);

  return (
    <div className="space-y-4">
      <ClipperFilter clippers={clippers} value={user} onChange={setUser} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="panel px-6 py-2">
        {events === null && !error ? (
          <p className="py-8 text-center text-sm text-ink-faint">Loading…</p>
        ) : events && events.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-paper-border">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {e.kind === "download"
                      ? `Downloaded ${e.amount} template${e.amount === 1 ? "" : "s"}`
                      : "Signed in"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-faint">
                    {typeof e.meta?.filename === "string" ? e.meta.filename : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-ink">{e.username}</p>
                  <p className="text-xs text-ink-faint">{fmtDate(e.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
