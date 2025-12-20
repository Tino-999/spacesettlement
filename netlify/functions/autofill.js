// netlify/functions/autofill.js
// Netlify Function: CORS + OpenAI Responses API (Structured Outputs / JSON Schema)
// Returns JSON: { type, title, href, image, summary, tags }
//
// Enforces non-empty content:
// - summary: minLength >= 40
// - tags: 2..6 items, slug-style lowercase
//
// Also robustly extracts JSON from Responses API, whether it comes back as:
// - content[].type === "output_json" with content[].json
// - content[].type === "output_text" with content[].text containing JSON

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

function text(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    body: String(body ?? ""),
  };
}

function toImagePlaceholder(title) {
  // "Elon Musk" -> "elon_musk.jpg"
  // "Gerard K. O'Neill" -> "gerard_k_oneill.jpg"
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "") // remove apostrophes
    .replace(/[^a-z0-9]+/g, "_") // non-alnum -> underscore
    .replace(/^_+|_+$/g, ""); // trim underscores
  return slug ? `${slug}.jpg` : "placeholder.jpg";
}

// Extracts JSON from Responses API result (Structured Outputs).
// Handles both "output_json" and "output_text" (JSON-as-string) variants.
function extractStructuredJson(data) {
  const outputs = Array.isArray(data?.output) ? data.output : [];

  // 1) Preferred: "output_json" blocks
  for (const out of outputs) {
    const content = Array.isArray(out?.content) ? out.content : [];
    for (const c of content) {
      if (c && c.type === "output_json" && c.json && typeof c.json === "object") {
        return c.json;
      }
      // Some variants may put json directly on content items
      if (c && c.json && typeof c.json === "object") {
        return c.json;
      }
    }
  }

  // 2) Common: JSON returned as text inside content items
  for (const out of outputs) {
    const content = Array.isArray(out?.content) ? out.content : [];
    for (const c of content) {
      // Observed in your screenshot: type "output_text" with field "text"
      if (c && (c.type === "output_text" || c.type === "text") && typeof c.text === "string") {
        const s = c.text.trim();
        if (!s) continue;
        try {
          return JSON.parse(s);
        } catch {
          // continue
        }
      }
    }
  }

  // 3) Fallback: convenience field output_text (may be absent)
  if (typeof data?.output_text === "string") {
    const s = data.output_text.trim();
    if (s) {
      try {
        return JSON.parse(s);
      } catch {
        // ignore
      }
    }
  }

  return null;
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return text(405, "Method Not Allowed");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return text(500, "OPENAI_API_KEY missing on Netlify");
  }

  let req;
  try {
    req = JSON.parse(event.body || "{}");
  } catch {
    return text(400, "Invalid JSON body");
  }

  const title = String(req.title || "").trim();
  const type = String(req.type || "topic").trim();
  const current = req.current && typeof req.current === "object" ? req.current : {};

  if (!title) {
    return text(400, "Missing title");
  }

  // Enforce "content": no empty summary, at least 2 tags.
  // href may be empty if unknown.
  const tagPattern = "^[a-z0-9][a-z0-9_-]*$";
  const imagePattern = "^[a-z0-9][a-z0-9_]*\\.jpg$"; // underscores + .jpg

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      href: { type: "string" }, // may be empty
      image: { type: "string", pattern: imagePattern },
      summary: {
        type: "string",
        minLength: 40, // enforce non-empty meaningful summary
        maxLength: 500,
      },
      tags: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "string",
          minLength: 2,
          maxLength: 24,
          pattern: tagPattern,
        },
      },
    },
    required: ["type", "title", "href", "image", "summary", "tags"],
  };

  const instructions =
    "You help fill entries for a space-settlement index.\n" +
    "Be factual and neutral.\n" +
    "Rules:\n" +
    "- Return valid JSON matching the schema.\n" +
    "- If you are unsure about href, return empty string.\n" +
    "- For image: return a placeholder filename derived from the title: firstname_lastname.jpg (lowercase, underscores). No folders.\n" +
    "- Summary: 1–3 neutral sentences. MUST NOT be empty. If you lack verified details, write a neutral placeholder like:\n" +
    '  "No verified summary available from provided context; please add a source link or details." (Do not invent facts.)\n' +
    "- Tags: 2–6 short lowercase tags, slug style (letters/numbers/underscore/hyphen only). MUST NOT be empty.\n" +
    "- Do NOT invent citations.\n";

  const input =
    `Create an autofill suggestion for this entry.\n` +
    `type: ${type}\n` +
    `title: ${title}\n` +
    `current (may be empty):\n${JSON.stringify(current, null, 2)}\n`;

  const openaiPayload = {
    model: "gpt-4o-mini",
    instructions,
    input,
    temperature: 0.2,
    text: {
      format: {
        type: "json_schema",
        name: "autofill_v2", // REQUIRED by OpenAI; bump when schema changes
        strict: true,
        schema,
      },
    },
  };

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiPayload),
    });

    const raw = await res.text();

    if (!res.ok) {
      return text(500, `OpenAI error ${res.status}: ${raw}`);
    }

    const data = JSON.parse(raw);
    const extracted = extractStructuredJson(data);

    if (!extracted) {
      return text(500, `Could not extract structured JSON from OpenAI response.\nRAW:\n${raw}`);
    }

    // Normalize & enforce defaults
    const obj = { ...extracted };

    obj.type = String(obj.type || type || "topic");
    obj.title = title;

    // href: allow empty if unknown
    obj.href = String(obj.href || "");

    // image: enforce placeholder rule
    obj.image = String(obj.image || toImagePlaceholder(title));

    // summary: ensure non-empty (schema enforces, but keep safe fallback)
    obj.summary = String(obj.summary || "").trim();
    if (obj.summary.length < 40) {
      obj.summary =
        "No verified summary available from provided context; please add a source link or details.";
    }

    // tags: enforce 2–6, lowercase, slug-ish
    const cleanTag = (t) =>
      String(t || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "")
        .replace(/^_+|_+$/g, "");

    let tags = Array.isArray(obj.tags) ? obj.tags.map(cleanTag).filter(Boolean) : [];
    tags = [...new Set(tags)].slice(0, 6);

    // If model still returns too few (shouldn't with strict+minItems), pad with generic relevant tags
    const pad = ["space_settlement", "spaceflight", "reference", "biography", "organization", "concept"];
    while (tags.length < 2 && pad.length) {
      const next = pad.shift();
      if (next && !tags.includes(next)) tags.push(next);
    }
    obj.tags = tags.slice(0, 6);

    return json(200, obj);
  } catch (err) {
    return text(500, `Function error: ${err?.message || err}`);
  }
};
