import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

// Öffentliche Werte – kein Geheimnis. Der OpenAI-Key liegt nur serverseitig
// als Edge-Function-Secret.
export const SUPABASE_URL = "https://cchuanvedsetkwfskskf.supabase.co";
export const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjaHVhbnZlZHNldGt3ZnNrc2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDk2NjMsImV4cCI6MjA5NTkyNTY2M30.0YlMOTA2mgiHkLBiFcIPG-4s09O0j4BGxVlfswKdz4g";

/** Clipper melden sich nur mit Benutzernamen an – die Mail ist ein Interna. */
export const EMAIL_DOMAIN = "clipper.cutg";
export const HISTORY_BUCKET = "clipper-history";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "cutg_auth",
  },
});

export interface Profile {
  user_id: string;
  username: string;
  display_name: string | null;
  role: "admin" | "clipper";
  active: boolean;
  monthly_limit: number | null;
  used_this_month: number;
  used_total: number;
}

export interface HistoryEntry {
  id: string;
  created_at: string;
  style: string;
  status: string;
  error?: string | null;
  mode: string | null;
  gender: string | null;
  job_id?: string;
  after_path: string | null;
  before_path: string | null;
  user_id?: string;
  username?: string;
}

export interface ClipperRow {
  user_id: string;
  username: string;
  display_name: string | null;
  role: "admin" | "clipper";
  active: boolean;
  monthly_limit: number | null;
  created_at: string;
  note: string | null;
  gen_total: number;
  gen_month: number;
  gen_7d: number;
  gen_failed: number;
  downloads: number;
  last_active: string | null;
}

export async function rpc<T>(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function signIn(username: string, password: string): Promise<void> {
  const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      /invalid login credentials/i.test(error.message)
        ? "Benutzername oder Passwort ist falsch."
        : error.message
    );
  }
}

/**
 * Abmelden. Wenn der Server den Logout ablehnt — etwa weil der Account
 * inzwischen gelöscht wurde — wird die Sitzung wenigstens lokal entfernt,
 * damit niemand auf dem Blockiert-Bildschirm festhängt.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}

/** Ruft die Admin-Edge-Function auf (Accounts anlegen, Passwort zurücksetzen). */
export async function adminCall<T>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("clipper-admin", {
    body: { action, ...payload },
  });
  if (error) {
    // Die Function liefert den echten Grund im Body – der steckt in der Response
    let detail = "";
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      detail = await res
        .json()
        .then((b: { error?: string }) => b?.error ?? "")
        .catch(() => "");
    }
    throw new Error(detail || error.message);
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

/** Feuert-und-vergisst: Downloads/Logins landen im Verlauf, stören aber nie. */
export function logEvent(
  kind: "login" | "download",
  amount = 1,
  meta: Record<string, unknown> = {}
): void {
  rpc("mkt_log_event", { p_kind: kind, p_amount: amount, p_meta: meta }).catch(
    () => {}
  );
}

/** Signierte URL fürs Archiv – Clipper sehen nur den eigenen Ordner (Storage-RLS). */
export async function archiveUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(HISTORY_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export interface SessionState {
  loading: boolean;
  profile: Profile | null;
  /** Eingeloggt, aber ohne Clipper-Profil oder gesperrt */
  blocked: "no-profile" | "inactive" | null;
  /** Profil konnte nicht geladen werden (Netz/Server) */
  error: string | null;
  reload: () => Promise<void>;
}

export function useSession(): SessionState {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocked, setBlocked] = useState<SessionState["blocked"]>(null);
  const [error, setError] = useState<string | null>(null);
  // Nur das Ergebnis des jüngsten Laufs zählt – sonst überschreibt ein
  // langsamer Vorgänger (z.B. vom Abmelden) das frische Profil.
  const run = useRef(0);

  const load = useCallback(async () => {
    const seq = ++run.current;
    const done = <T,>(fn: () => T) => {
      if (seq === run.current) fn();
    };

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      done(() => {
        setProfile(null);
        setBlocked(null);
        setError(null);
        setLoading(false);
      });
      return;
    }
    try {
      const me = await rpc<Profile | null>("mkt_me");
      done(() => {
        setError(null);
        if (!me) {
          setProfile(null);
          setBlocked("no-profile");
        } else if (!me.active) {
          setProfile(null);
          setBlocked("inactive");
        } else {
          setProfile(me);
          setBlocked(null);
        }
      });
    } catch (e) {
      // Ein Serverfehler ist kein fehlendes Profil – sonst sieht ein gültiger
      // Clipper fälschlich „kein Zugang“.
      done(() => {
        setProfile(null);
        setBlocked(null);
        setError(e instanceof Error ? e.message : String(e));
      });
    }
    done(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      // Nicht im Callback arbeiten: supabase-js hält dort eine Sperre, unter
      // der getSession()/rpc() blockieren würden.
      setTimeout(() => {
        if (alive) load();
      }, 0);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [load]);

  return { loading, profile, blocked, error, reload: load };
}
