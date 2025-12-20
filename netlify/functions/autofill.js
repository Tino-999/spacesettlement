// netlify/functions/autofill.js
// Robust: no npm deps, uses fetch to call OpenAI

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: "OPENAI_API_KEY missing on Netlify" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const title = String(payload?.title || "").trim();
  const type = String(payload?.type || "").trim();
  const current = payload?.current || {};

  if (!title) return { statusCode: 400, body: "Missing title" };

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
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        instructions,
        input: [{ role: "user", content: userText }],
        text: { format: { type: "json_schema", json_schema: schema } }
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { statusCode: 500, body: `OpenAI error: ${resp.status} ${errText}` };
    }

    const data = await resp.json();
    const text = data.output_text || "{}";
    const obj = JSON.parse(text);

    obj.title = title;
    obj.type = (obj.type && obj.type.trim()) ? obj.type : (type || "topic");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(obj)
    };
  } catch (e) {
    return { statusCode: 500, body: `Function error: ${e?.message || e}` };
  }
};
