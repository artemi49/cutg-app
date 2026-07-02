// Vercel Serverless Function: proxied OpenAI GPT-Image edit.
// OPENAI_API_KEY must be set in the Vercel project (Settings → Environment Variables).
// Runs the same logic as the local Vite dev proxy in vite.config.ts.

export const config = { maxDuration: 60 };

const OPENAI_EDITS_ENDPOINT = "https://api.openai.com/v1/images/edits";

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Invalid image data (data URL expected)");
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set on the server" });
    return;
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { image, prompt, size } = body;
    if (!image || !prompt) {
      res.status(400).json({ error: "image and prompt are required" });
      return;
    }

    const { buffer, mime } = dataUrlToBuffer(image);
    const ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";

    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("n", "1");
    form.append("size", size || "1024x1536");
    form.append("image", new Blob([buffer], { type: mime }), `before.${ext}`);

    const aiRes = await fetch(OPENAI_EDITS_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const json = await aiRes.json();
    if (!aiRes.ok) {
      res.status(aiRes.status).json({ error: json?.error?.message || "OpenAI error" });
      return;
    }

    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      res.status(502).json({ error: "No image data received" });
      return;
    }

    res.status(200).json({ image: `data:image/png;base64,${b64}` });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
