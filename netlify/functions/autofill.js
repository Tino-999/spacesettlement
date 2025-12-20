// netlify/functions/autofill.js
// Netlify Function: CORS + OpenAI Responses API (Structured Outputs / JSON Schema)
// Returns JSON: { type, title, href, image, summary, tags }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function toImagePlaceholder(title) {
  // "Elon Musk" -> "elon_musk.jpg"
  // "Gerard K. O'Neill" -> "gerard_k_oneill.jpg"
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")          // remove apostrophes
    .replace(/[^a-z0-9]+/g, "_")   // non-alnum -> underscore
    .replace(/^_+|_+$/g, "");      // trim underscores
  return slug ? `${slug}.jpg` : "";
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: "Method Not Allowed" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: "OPENAI_API_KEY missing on Netlify" };
  }

  let req;
  try {
    req = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: "Invalid JSON body" };
  }

  const title = String(req.title || "").trim();
  const type = String(req.type || "topic").trim();
  const current = req.current && typeof req.current === "object" ? req.current : {};

  if (!title) {
    return { statusCode: 400, headers: CORS_HEADERS, body: "Missing title" };
  }

  // JSON Schema for Structured Outputs (Responses API)
  // IMPORTANT: According to the docs, use: text.format = { type:"json_schema", strict:true, schema:{...} }
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string" },
      title: { type: "string" },
      href: { type: "string" },
      image: { type: "string" },
      summary: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["type", "title", "href", "image", "summary", "tags"],
  };

  const instructions =
    "You help fill entries for a space-settlement index.\n" +
    "Be factual and neutral.\n" +
    "Rules:\n" +
    "- If you are unsure about href, return empty string.\n" +
    "- For image: return a placeholder filename derived from the title: firstname_lastname.jpg (lowercase, underscores). No folders.\n" +
    "- Summary: 1–3 neutral sentences, no hype, no marketing.\n" +
    "- Tags: 2–6 short lowercase tags, comma-free strings.\n" +
    "- Do NOT invent citations.\n";

  const input =
    `Create an autofill suggestion for this entry.\n` +
    `type: ${type}\n` +
    `title: ${title}\n` +
    `current (may be empty):\n${JSON.stringify(current, null, 2)}\n`;

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        instructions,
        input,
        temperature: 0.2,
        text: {
          format: {
            type: "json_schema",
            strict: true,
            schema,
          },
        },
      }),
    });

    const raw = await res.text();

    if (!res.ok) {
      // Forward the OpenAI error so you see it in the editor output
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: `OpenAI error ${res.status}: ${raw}`,
      };
    }

    const data = JSON.parse(raw);

    // Responses API: most convenient is output_text (string)
    const outText = typeof data.output_text === "string" ? data.output_text : "";
    let obj = {};
    try {
      obj = JSON.parse(outText || "{}");
    } catch {
      // If the SDK/format changes, still show raw for debugging
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: `Model returned non-JSON output_text:\n${outText || "(empty)"}\n\nRAW:\n${raw}`,
      };
    }

    // Enforce your desired defaults
    obj.type = String(obj.type || type || "topic");
    obj.title = title;

    // href: allow empty if unknown
    obj.href = String(obj.href || "");

    // image: your desired placeholder rule (vorname_nachname.jpg)
    const fallbackImage = toImagePlaceholder(title);
    obj.image = String(obj.image || fallbackImage);

    // summary/tags
    obj.summary = String(obj.summary || "");
    obj.tags = Array.isArray(obj.tags) ? obj.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [];

    // Safety: ensure 2–6 tags if possible (but don't force nonsense)
    if (obj.tags.length > 6) obj.tags = obj.tags.slice(0, 6);

    return json(200, obj);
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: `Function error: ${err?.message || err}`,
    };
  }
};
