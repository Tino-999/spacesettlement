// netlify/functions/autofill.js
// Netlify Function with FULL CORS support

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  // ✅ Preflight request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: "Method Not Allowed",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: "OPENAI_API_KEY missing",
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: "Invalid JSON",
    };
  }

  const title = data.title || "";
  const type = data.type || "topic";

  const prompt = `
Create a factual autofill entry.

Title: ${title}
Type: ${type}

Return JSON with:
- type
- title
- href (empty if unknown)
- image (empty if unknown)
- summary (1–3 neutral sentences)
- tags (2–6 lowercase tags)
`;

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
      }),
    });

    const json = await res.json();
    const text =
      json.output?.[0]?.content?.[0]?.text ||
      "{}";

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: err.message,
    };
  }
};
