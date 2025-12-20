// netlify/functions/autofill.js
// Netlify Function: OpenAI autofill with CORS + JSON schema + image placeholder

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function textResponse(statusCode, text) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    body: String(text ?? ""),
  };
}

// Slugify "Elon Musk" -> "elon_musk"
function slugifyFilename(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Map item type to your image folder
function typeToImageFolder(type) {
  const t = String(type || "").toLowerCase().trim();
  const map = {
    person: "people",
    project: "projects",
    org: "org",
    topic: "topics",
    concept: "concepts",
    book: "books",
    movie: "movies",
  };
  return map[t] || "misc";
}

exports.handler = async (event) => {
  // Preflight (CORS)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return textResponse(405, "Method Not Allowed");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return textResponse(500, "OPENAI_API_KEY missing on Netlify (Environment Variables).");
  }

  let req;
  try {
    req = JSON.parse(event.body || "{}");
  } catch {
    return textResponse(400, "Invalid JSON body");
  }

  const title = String(req.title || "").trim();
  const type = String(req.type || "topic").trim();
  const current = req.current && typeof req.current === "object" ? req.current : {};

  if (!title) {
    return textResponse(400, "Missing title");
  }

  // JSON schema to force clean structured output
  // NOTE: This is the "schema" object expected by Responses API json_schema formatter.
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
    "You assist a factual space-settlement knowledge base editor.\n" +
    "Return conservative suggestions only.\n" +
    "Rules:\n" +
    "- href: if you are not sure, return empty string.\n" +
    "- image: if you are not sure, return empty string (server will generate placeholder).\n" +
    "- summary: 1–3 neutral sentences.\n" +
    "- tags: 2–6 short lowercase tags.\n" +
    "- Output must match the JSON schema exactly.\n";

  const input =
    `Fill missing fields for this item.\n` +
    `Selected type: ${type}\n` +
    `Title: ${title}\n` +
    `Current values (may be empty):\n${JSON.stringify(current, null, 2)}\n`;

  try {
    // Netlify Node 18 has global fetch
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
        text: {
          format: {
            type: "json_schema",
            name: "ItemAutofill",
            schema,
          },
        },
      }),
    });

    const raw = await res.text();

    if (!res.ok) {
      // Pass through OpenAI error details
      return textResponse(500, `OpenAI error ${res.status}: ${raw}`);
    }

    let resp;
    try {
      resp = JSON.parse(raw);
    } catch {
      return textResponse(500, `OpenAI returned non-JSON response:\n${raw}`);
    }

    // Responses API: prefer output_text
    const outText = typeof resp.output_text === "string" ? resp.output_text : "";

    let obj;
    try {
      obj = JSON.parse(outText || "{}");
    } catch {
      return textResponse(500, `Model returned non-JSON output_text:\n${outText}`);
    }

    // Defensive normalization
    obj.type = String(obj.type || type || "topic");
    obj.title = title;
    obj.href = String(obj.href || "");
    obj.image = String(obj.image || "");
    obj.summary = String(obj.summary || "");
    obj.tags = Array.isArray(obj.tags) ? obj.tags.map((x) => String(x).toLowerCase()) : [];

    // ✅ Always generate placeholder image filename if empty
    if (!obj.image) {
      const folder = typeToImageFolder(obj.type);
      const file = slugifyFilename(title) || "unknown";
      obj.image = `assets/img/cards/${folder}/${file}.jpg`;
    }

    // If tags accidentally empty, add safe generic ones (non-factual, but helpful)
    if (!obj.tags.length) {
      const base = obj.type ? [String(obj.type).toLowerCase()] : [];
      obj.tags = Array.from(new Set([...base, "space"]).values()).slice(0, 6);
    }

    return jsonResponse(200, obj);
  } catch (err) {
    return textResponse(500, `Function error: ${err?.message || err}`);
  }
};
