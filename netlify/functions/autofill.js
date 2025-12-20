import OpenAI from "openai";

/**
 * Netlify Function: /.netlify/functions/autofill
 * Erwartet JSON: { title: string, type: string, current?: object }
 * Antwort: { type,title,href,image,summary,tags[] }
 */
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("OPENAI_API_KEY missing on Netlify", { status: 500 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const title = String(payload?.title || "").trim();
  const type = String(payload?.type || "").trim();
  const current = payload?.current || {};

  if (!title) return new Response("Missing title", { status: 400 });

  const client = new OpenAI({ apiKey });

  // Structured Outputs (JSON Schema) -> stabil parsbares JSON
  // Doku: OpenAI Structured Outputs :contentReference[oaicite:3]{index=3}
  const schema = {
    name: "ItemAutofill",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string" },
        title: { type: "string" },
        href: { type: "string" },
        image: { type: "string" },
        summary: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["type", "title", "href", "image", "summary", "tags"]
    },
    strict: true
  };

  const instructions =
    "You generate conservative autofill suggestions for a factual knowledge base.\n" +
    "Rules:\n" +
    "- If not confident about a field, return empty string (or [] for tags).\n" +
    "- Do NOT invent URLs or image paths.\n" +
    "- Summary: 1–3 neutral sentences.\n" +
    "- Tags: 2–6 short lowercase tags.\n" +
    "- Output MUST match the JSON schema exactly.";

  const userText =
    `Create an item proposal for:\n` +
    `- title: ${title}\n` +
    `- type (selected): ${type}\n\n` +
    `Existing values:\n${JSON.stringify(current, null, 2)}\n`;

  try {
    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      instructions,
      input: [{ role: "user", content: userText }],
      text: { format: { type: "json_schema", json_schema: schema } }
    });

    const text = resp.output_text || "{}";
    const obj = JSON.parse(text);

    // Titel nie "korrigieren"
    obj.title = title;
    obj.type = (obj.type && obj.type.trim()) ? obj.type : (type || "topic");

    return Response.json(obj, { status: 200 });
  } catch (e) {
    return new Response(`OpenAI error: ${e?.message || e}`, { status: 500 });
  }
};
