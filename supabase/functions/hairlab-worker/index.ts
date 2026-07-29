// Background worker: processes ONE queue item per invocation, then reliably
// chains to the next via EdgeRuntime.waitUntil. A 1-minute cron is the backup.
//
// Jedes Vorher-/Nachher-Bild wird zusätzlich in den privaten Bucket
// `clipper-history` archiviert. Nur der Worker (service_role) schreibt dort —
// die Clipper kommen an ihr Archiv nicht heran und können es nicht löschen.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// deno-lint-ignore no-explicit-any
const ER: any = (globalThis as any).EdgeRuntime;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-2";
const SELF_URL = `${SUPABASE_URL}/functions/v1/hairlab-worker`;
const BUCKET = "clipper-history";

async function rpc(fn: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("invalid data URL");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: m[1] };
}

/** Legt das Bild im Archiv-Bucket ab und gibt den Pfad zurück (null bei Fehler). */
async function archive(path: string, dataUrl: string): Promise<string | null> {
  try {
    const { bytes, mime } = dataUrlToBytes(dataUrl);
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": mime,
          "x-upsert": "true",
        },
        body: bytes,
      },
    );
    if (!res.ok) {
      console.error("archive failed:", path, res.status, (await res.text()).slice(0, 200));
      return null;
    }
    return path;
  } catch (e) {
    console.error("archive error:", path, String((e as Error)?.message || e));
    return null;
  }
}

const extOf = (mime: string) =>
  mime.includes("webp") ? "webp" : mime.includes("png") ? "png" : "jpg";

async function generate(image: string, prompt: string, size: string): Promise<string> {
  const { bytes, mime } = dataUrlToBytes(image);
  const ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size || "1024x1024");
  form.append("image", new Blob([bytes], { type: mime }), `before.${ext}`);
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${raw.slice(0, 400) || "(empty)"}`);
  const json = JSON.parse(raw);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image data in response");
  return `data:image/png;base64,${b64}`;
}

function chainNext() {
  // Nächstes Element anstoßen – waitUntil hält die Funktion am Leben, bis der Call raus ist
  const p = fetch(SELF_URL, { method: "POST" }).catch(() => {});
  if (ER?.waitUntil) ER.waitUntil(p);
}

Deno.serve(async () => {
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const rows = await rpc("mkt_claim_item", {});
    const item = Array.isArray(rows) ? rows[0] : rows;
    if (!item) {
      return new Response(JSON.stringify({ processed: 0, queueEmpty: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const folder = `${item.user_id ?? "legacy"}/${item.job_id}`;

    // Vorher-Bild einmal pro Auftrag archivieren
    if (!item.has_before && item.image) {
      const mime = /^data:([^;]+);base64,/.exec(item.image)?.[1] ?? "image/jpeg";
      const path = await archive(`${folder}/before.${extOf(mime)}`, item.image);
      if (path) await rpc("mkt_set_before_path", { p_job: item.job_id, p_path: path }).catch(() => {});
    }

    try {
      const result = await generate(item.image, item.prompt, item.size);
      const afterPath = await archive(`${folder}/${item.idx}-after.png`, result);
      await rpc("mkt_finish_item", {
        p_item: item.item_id,
        p_result: result,
        p_error: null,
        p_after_path: afterPath,
      });
    } catch (e) {
      console.error("item failed:", String((e as Error)?.message || e));
      await rpc("mkt_finish_item", {
        p_item: item.item_id,
        p_result: null,
        p_error: String((e as Error)?.message || e),
        p_after_path: null,
      });
    }

    // Es koennte noch mehr geben → naechsten Aufruf anstossen (ueberlebt Funktions-Ende)
    chainNext();
    return new Response(JSON.stringify({ processed: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
