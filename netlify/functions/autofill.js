// netlify/functions/autofill.js
// Better content: always summary + tags, conservative href, image placeholder allowed

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

function slugifyForFilename(title) {
  // "Elon Musk" -> "elon_musk"
  // keep letters/numbers, turn spaces into underscores
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function pickImagePath(type, title) {
  const slug = slugifyForFilename(title);
  if (!slug) return "";

  // You can adapt these folders to your project structure
  if (type === "person") return `assets/img/cards/people/${slug}.jpg`;
  if (type === "company") return `assets/img/cards/companies/${slug}.jpg`;
  if (type === "place") return `assets/img/cards/places/${slug}.jpg`;
  return `assets/img/cards/topics/${slug}.jpg`;
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

  // Image placeholder is allowed, so we can provide a default filename suggestion
  const suggestedImage = pickImagePath(type, title);

  // Force structured output + enforce non-empty summary/tags
  const jsonSchema = {
    name: "ItemAutofill",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", minLength: 1 },
        title: { type: "string", minLength: 1 },

        // href may be empty OR a valid http(s) URL
        href: { type: "string", pattern: "^(|https?://.+)$" },

        // image may be empty OR a relative path without spaces
        image: { type: "string", pattern: "^(|[^\\s]+)$" },

        // summary must be non-empty (at least 20 chars is a good “not blank” guard)
        summary: { type: "string", minLength: 20, maxLength: 320 },

        // 2–6 tags, lowercase, short, hyphen allowed
        tags: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: { type: "string", pattern: "^[a-z0-9-]{2,24}$" },
        },
      },
      required: ["type", "title", "href", "image", "summary", "tags"],
    },
    strict: true,
  };

  const instructions = [
    "You assist a factual space-settlement knowledge base editor.",
    "Goal: propose a neutral summary + useful tags even if href/image are unknown.",
    "",
    "Rules:",
    "- Be factual and conservative. Do not invent specific numbers/dates if unsure.",
    "- href: return '' if you are not confident of an official/source URL.",
    "- image: you MAY return a placeholder filename we can create later.",
    "- summary: ALWAYS 1–3 neutral sentences (no hype, no marketing).",
    "- tags: ALWAYS 2–6 lowercase tags, short (e.g. 'rocket-science', 'mars', 'habitat').",
    "",
    "Tag style guidance (examples):",
    "- people: 'engineer', 'entrepreneur', 'spaceflight', 'rockets', 'mars'",
    "- companies: 'aerospace', 'launch', 'satellites', 'infrastructure'",
    "- topics: 'habitats', 'life-support', 'in-situ-resource', 'terraforming'",
    "",
    "Return JSON matching the provided schema.",
  ].join("\n");

  const userInput = [
    "Fill missing fields for this item.",
    `title: ${title}`,
    `type (selected): ${type}`,
    `suggested image placeholder (ok to use): ${suggestedImage}`,
    "current values (may be empty):",
    JSON.stringify(current, null, 2),
  ].join("\n");

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
        input: userInput,
        text: {
          format: {
            type: "json_schema",
            name: "ItemAutofill",
            json_schema: jsonSchema,
          },
        },
      }),
    });

    const raw = await res.text();

    if (!res.ok) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: `OpenAI error ${res.status}: ${raw}`,
      };
    }

    const apiJson = JSON.parse(raw);
    const out = typeof apiJson.output_text === "string" ? apiJson.output_text : "";

    let obj;
    try {
      obj = JSON.parse(out || "{}");
    } catch {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: `Model returned non-JSON output_text:\n${out}`,
      };
    }

    // Defensive normalization
    obj.type = String(obj.type || type || "topic");
    obj.title = title;

    obj.href = String(obj.href || "");
    obj.image = String(obj.image || suggestedImage || ""); // default to placeholder
    obj.summary = String(obj.summary || "");

    obj.tags = Array.isArray(obj.tags) ? obj.tags.map((t) => String(t).toLowerCase()) : [];

    // If model returned empty image even though allowed, fill it:
    if (!obj.image) obj.image = suggestedImage;

    return jsonResponse(200, obj);
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: `Function error: ${err?.message || err}`,
    };
  }
};
