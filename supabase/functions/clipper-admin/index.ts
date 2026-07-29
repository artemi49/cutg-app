// Accountverwaltung für die Clipper.
//
// verify_jwt ist bewusst aus, weil `bootstrap` (allererster Admin) ohne Login
// läuft. Jede andere Aktion prüft das Admin-JWT hier selbst über mkt_me().
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Interne Pseudo-Domain: die Clipper loggen sich nur mit Benutzernamen ein. */
const EMAIL_DOMAIN = "clipper.cutg";
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const emailFor = (username: string) => `${username}@${EMAIL_DOMAIN}`;

function checkUsername(raw: unknown): string {
  const username = String(raw ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "Username: 3–24 characters, only a–z, 0–9, dot, dash, underscore.",
    );
  }
  return username;
}

function checkPassword(raw: unknown): string {
  const password = String(raw ?? "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (password.length > 72) throw new Error("Password must be at most 72 characters.");
  return password;
}

/** Profil des Aufrufers anhand seines JWT — Quelle der Wahrheit für „ist Admin“. */
async function callerProfile(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await asCaller.rpc("mkt_me");
  if (error || !data) return null;
  return data as { user_id: string; username: string; role: string; active: boolean };
}

async function requireAdmin(req: Request) {
  const me = await callerProfile(req);
  if (!me || me.role !== "admin" || !me.active) throw new Error("Admins only.");
  return me;
}

/** Legt den Auth-User an und verknüpft ihn mit einem Clipper-Profil. */
async function createAccount(opts: {
  username: string;
  password: string;
  displayName?: string | null;
  role: "admin" | "clipper";
  monthlyLimit: number | null;
  createdBy: string | null;
  bootstrap: boolean;
}) {
  const { data: taken } = await admin.rpc("mkt_srv_username_taken", {
    p_username: opts.username,
  });
  if (taken) throw new Error(`Username “${opts.username}” is already taken.`);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: emailFor(opts.username),
    password: opts.password,
    email_confirm: true,
    user_metadata: { username: opts.username, kind: "clipper" },
  });
  if (createErr || !created?.user) {
    throw new Error(createErr?.message ?? "Could not create the account.");
  }

  const { error: regErr } = await admin.rpc("mkt_srv_register", {
    p_user: created.user.id,
    p_username: opts.username,
    p_role: opts.role,
    p_limit: opts.monthlyLimit,
    p_display: opts.displayName ?? null,
    p_created_by: opts.createdBy,
    p_bootstrap: opts.bootstrap,
  });
  if (regErr) {
    // Profil fehlgeschlagen → Auth-User wieder entfernen, sonst bleibt eine Leiche zurück
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw new Error(regErr.message);
  }
  return created.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    switch (action) {
      /** Allererster Admin — funktioniert nur mit dem Setup-Code und nur einmal. */
      case "bootstrap": {
        const username = checkUsername(body.username);
        const password = checkPassword(body.password);
        const { data: ok } = await admin.rpc("mkt_srv_bootstrap_ok", {
          p_code: String(body.setup_code ?? ""),
        });
        if (!ok) throw new Error("Setup code is invalid or already used.");

        const userId = await createAccount({
          username,
          password,
          displayName: body.display_name ?? null,
          role: "admin",
          monthlyLimit: null,
          createdBy: null,
          bootstrap: true,
        });
        return json(200, { user_id: userId, username });
      }

      case "create": {
        const me = await requireAdmin(req);
        const username = checkUsername(body.username);
        const password = checkPassword(body.password);
        const limitRaw = body.monthly_limit;
        const monthlyLimit =
          limitRaw === null || limitRaw === undefined || limitRaw === ""
            ? null
            : Math.max(1, Math.min(100000, Number(limitRaw) | 0));

        const userId = await createAccount({
          username,
          password,
          displayName: body.display_name ?? null,
          role: body.role === "admin" ? "admin" : "clipper",
          monthlyLimit,
          createdBy: me.user_id,
          bootstrap: false,
        });
        return json(200, { user_id: userId, username });
      }

      case "reset_password": {
        await requireAdmin(req);
        const password = checkPassword(body.password);
        const userId = String(body.user_id ?? "");
        if (!userId) throw new Error("user_id is missing.");
        const { error } = await admin.auth.admin.updateUserById(userId, { password });
        if (error) throw new Error(error.message);
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: `Unknown action: ${action || "(empty)"}` });
    }
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : String(e) });
  }
});
