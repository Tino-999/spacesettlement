// netlify/functions/autofill.js
// Netlify Function with CORS + OpenAI Responses (Structured Outputs via text.format.schema)
// Returns JSON: { type,title,href,image,summary,tags }

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

  // IMPORTANT: For Responses API REST, use text.format.schema (not json_schema wrapper)
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
    "Return conservative suggestions ONLY.\n" +
    "Rules:\n" +
    "- If unsure about href or image, return empty string.\n" +
    "- Summary: 1–3 neutral sentences.\n" +
    "- Tags: 2–6 short lowercase tags.\n" +
    "- Output MUST be valid JSON matching the provided schema.\n";

  const userInput =
    `Fill the missing fields for this item.\n` +
    `title: ${title}\n` +
    `type (selected): ${type}\n` +
    `current values:\n${JSON.stringify(current, null, 2)}\n`;

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

        // ✅ Structured Outputs (REST)
        text: {
          format: {
            type: "json_schema",
            strict: true,
            schema, // ← REQUIRED (fixes your error)
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

    const json = JSON.parse(raw);

    // Responses API: output_text should contain the JSON object as a string
    const out = typeof json.output_text === "string" ? json.output_text : "";

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

    // Defensive defaults
    obj.type = String(obj.type || type || "topic");
    obj.title = title;
    obj.href = String(obj.href || "");
    obj.image = String(obj.image || "");
    obj.summary = String(obj.summary || "");
    obj.tags = Array.isArray(obj.tags) ? obj.tags.map(String) : [];

    return jsonResponse(200, obj);
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: `Function error: ${err?.message || err}`,
    };
  }
};
