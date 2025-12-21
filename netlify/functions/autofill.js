// netlify/functions/autofill.js
// Netlify Function: CORS + OpenAI Responses API (Structured Outputs / JSON Schema)
// Returns JSON: { type, title, href, image, summary, tags }
//
// Changes requested:
// - href should be the Wikipedia page if it exists; otherwise "kein Wiki" (German string, as requested).
//   Implementation: lookup via Wikipedia REST API server-side (factual; avoids LLM guessing).
// - summary must always be short English text answering:
//   "Why is the person recognized among scientists and what is their contribution to space settlement?"
//   If unknown from context, say so explicitly (do not invent facts).

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
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `${slug}.jpg` : "placeholder.jpg";
}

// Extract JSON from Responses API result (Structured Outputs).
// Handles both "output_json" and "output_text" (JSON-as-string) variants.
function extractStructuredJson(data) {
  const outputs = Array.isArray(data?.output) ? data.output : [];

  // 1) Preferred: "output_json"
  for (const out of outputs) {
    const content = Array.isArray(out?.content) ? out.content : [];
    for (const c of content) {
      if (c && c.type === "output_json" && c.json && typeof c.json === "object") return c.json;
      if (c && c.json && typeof c.json === "object") return c.json;
    }
  }

  // 2) Common: JSON in content[].text
  for (const out of outputs) {
    const content = Array.isArray(out?.content) ? out.content : [];
    for (const c of content) {
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

  // 3) Fallback: data.output_text convenience field
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

// Wikipedia lookup via REST summary endpoint.
// Returns a canonical page URL if found, else null.
async function wikipediaUrlForTitle(title) {
  const t = String(title || "").trim();
  if (!t) return null;

  const encoded = encodeURIComponent(t.replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // polite UA; Wikipedia may throttle generic/no UA requests
        "User-Agent": "spacesettlement-index/1.0 (Netlify Function)",
        "Accept": "application/json",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();

    // Disambiguation pages are still pages, but often not what we want.
    // If it's disambiguation, treat as "not found" to avoid wrong href.
    if (data?.type === "disambiguation") return null;

    const pageUrl = data?.content_urls?.desktop?.page;
    return typeof pageUrl === "string" && pageUrl.startsWith("http") ? pageUrl : null;
  } catch {
    return null;
  }
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

  if (!title) return text(400, "Missing title");

  // We will fill href server-side (Wikipedia lookup), so model does NOT need to provide it.
  // Still keep href in schema because the function returns it.
  const tagPattern = "^[a-z0-9][a-z0-9_-]*$";
  const imagePattern = "^[a-z0-9][a-z0-9_]*\\.jpg$";

  // Build schema dynamically - for persons, birthYear and deathYear are required
  const baseRequired = ["type", "title", "href", "image", "summary", "tags"];
  const personRequired = type === "person" ? ["birthYear", "deathYear"] : [];
  
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      // We'll accept anything here, but will overwrite with Wikipedia URL or "kein Wiki"
      href: { type: "string", minLength: 1 },
      image: { type: "string", pattern: imagePattern },
      // Short and always present (we'll enforce a fallback if needed)
      summary: { type: "string", minLength: 20, maxLength: 280 },
      tags: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: { type: "string", minLength: 2, maxLength: 24, pattern: tagPattern },
      },
      // For persons: birth and death years
      birthYear: { type: "integer", minimum: 0, maximum: 2100 },
      deathYear: { 
        anyOf: [
          { type: "integer", minimum: 0, maximum: 2100 },
          { type: "null" }
        ]
      },
    },
    required: [...baseRequired, ...personRequired],
  };

  const instructions =
    "You help fill entries for a space-settlement index.\n" +
    "Be factual and neutral.\n" +
    "IMPORTANT: Do not invent facts.\n" +
    "Output valid JSON matching the schema.\n" +
    "Rules:\n" +
    "- href: you may leave as empty or placeholder; server will overwrite.\n" +
    "- image: placeholder filename from title: firstname_lastname.jpg (lowercase, underscores). No folders.\n" +
    "- Summary: English, as short as possible, and MUST answer:\n" +
    "  (1) Why is the person recognized among scientists?\n" +
    "  (2) What is their contribution to space settlement?\n" +
    "  If either is not verifiable from the provided context, explicitly say so (e.g., 'Not established from provided context').\n" +
    "- Tags: 2–6 short lowercase slug tags (letters/numbers/underscore/hyphen only).\n" +
    "- birthYear: For persons (type='person'), you MUST ALWAYS provide the birth year as an integer (e.g., 1971). Look up the information if needed.\n" +
    "- deathYear: For persons (type='person'), you MUST ALWAYS provide either: (a) the death year as an integer if the person is deceased (e.g., 2023), OR (b) null if the person is still alive. Look up the information if needed.\n";

  const input =
    `Create an autofill suggestion for this entry.\n` +
    `type: ${type}\n` +
    `title: ${title}\n` +
    `current (may be empty):\n${JSON.stringify(current, null, 2)}\n` +
    (type === "person" 
      ? `\nIMPORTANT: Since this is a person (type='person'), you MUST ALWAYS include birthYear and deathYear in your response.\n` +
        `- birthYear: integer (e.g., 1971) - REQUIRED, look up if needed\n` +
        `- deathYear: integer if deceased (e.g., 2023), or null if still alive - REQUIRED, look up if needed\n` +
        `Do NOT omit these fields. They are required for persons.\n`
      : ``);

  const openaiPayload = {
    model: "gpt-4o-mini",
    instructions,
    input,
    temperature: 0.2,
    text: {
      format: {
        type: "json_schema",
        name: "autofill_v3",
        strict: true,
        schema,
      },
    },
  };

  try {
    // 1) Get Wikipedia URL (factual) in parallel with LLM generation
    const wikiPromise = wikipediaUrlForTitle(title);

    // 2) Get LLM output
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiPayload),
    });

    const raw = await res.text();
    if (!res.ok) return text(500, `OpenAI error ${res.status}: ${raw}`);

    const data = JSON.parse(raw);
    const extracted = extractStructuredJson(data);
    if (!extracted) {
      return text(500, `Could not extract structured JSON from OpenAI response.\nRAW:\n${raw}`);
    }

    const wikiUrl = await wikiPromise;

    // Normalize & enforce defaults
    const obj = { ...extracted };

    obj.type = String(obj.type || type || "topic");
    obj.title = title;

    // href: Wikipedia URL or "kein Wiki"
    obj.href = wikiUrl || "kein Wiki";

    // image: enforce placeholder rule
    obj.image = String(obj.image || toImagePlaceholder(title));

    // summary: must be short English and not empty
    obj.summary = String(obj.summary || "").trim();
    if (obj.summary.length < 20) {
      obj.summary =
        "Recognition among scientists: not established from provided context. Contribution to space settlement: not established from provided context.";
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

    // Pad if too few (should be rare with strict+minItems)
    const pad = ["space_settlement", "spaceflight", "reference", "biography"];
    while (tags.length < 2 && pad.length) {
      const next = pad.shift();
      if (next && !tags.includes(next)) tags.push(next);
    }
    obj.tags = tags.slice(0, 6);

    // For persons, include birthYear and deathYear if provided
    if (type === "person") {
      // Always try to include birthYear if the AI provided it
      if (extracted.birthYear != null && typeof extracted.birthYear === "number") {
        obj.birthYear = extracted.birthYear;
      }
      // Handle deathYear: if number, person is deceased; if null, person is alive
      if (extracted.deathYear != null && typeof extracted.deathYear === "number") {
        obj.deathYear = extracted.deathYear;
      } else if (extracted.deathYear === null) {
        // Person is still alive - set to null explicitly so frontend knows to clear the field
        obj.deathYear = null;
      }
      // If deathYear is undefined, the AI didn't provide it - we also don't set it
    }

    return json(200, obj);
  } catch (err) {
    return text(500, `Function error: ${err?.message || err}`);
  }
};
