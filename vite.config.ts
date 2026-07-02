import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

const OPENAI_EDITS_ENDPOINT = "https://api.openai.com/v1/images/edits";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/** data:-URL → { buffer, mime } */
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Ungültige Bild-Daten (data-URL erwartet)");
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

/**
 * Server-seitiger Proxy für OpenAI GPT-Image (Image-Edit).
 * OPENAI_API_KEY wird NUR hier gelesen und gelangt nie ins Browser-Bundle.
 */
function openAiProxy(env: Record<string, string>): Plugin {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_IMAGE_MODEL || "gpt-image-2";

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST")
      return sendJson(res, 405, { error: "Method not allowed" });
    if (!apiKey)
      return sendJson(res, 500, {
        error: "OPENAI_API_KEY fehlt in der .env-Datei",
      });

    try {
      const { image, prompt, size } = JSON.parse((await readBody(req)) || "{}");
      if (!image || !prompt)
        return sendJson(res, 400, { error: "image und prompt sind erforderlich" });

      const { buffer, mime } = dataUrlToBuffer(image);
      const ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";

      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("n", "1");
      form.append("size", size || "1024x1536"); // Hochformat, passt zu 3:4
      form.append(
        "image",
        new Blob([buffer], { type: mime }),
        `before.${ext}`
      );

      const aiRes = await fetch(OPENAI_EDITS_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      const json = await aiRes.json();
      if (!aiRes.ok)
        return sendJson(res, aiRes.status, {
          error: json?.error?.message || "OpenAI-Fehler",
        });

      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) return sendJson(res, 502, { error: "Keine Bilddaten erhalten" });

      return sendJson(res, 200, { image: `data:image/png;base64,${b64}` });
    } catch (err) {
      return sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  };

  return {
    name: "openai-image-proxy",
    configureServer(server) {
      server.middlewares.use(
        "/api/generate-after",
        handler as Connect.NextHandleFunction
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        "/api/generate-after",
        handler as Connect.NextHandleFunction
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // leeres Prefix "" → lädt auch nicht-VITE_ Variablen wie OPENAI_API_KEY (nur server-seitig)
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), openAiProxy(env)],
    server: { port: 5173 },
  };
});
