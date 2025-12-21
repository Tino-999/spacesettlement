// netlify/functions/autofill.js
// Netlify Function: CORS + OpenAI Responses API (Structured Outputs / JSON Schema)
//
// Ergebnis:
// { type, title, href, image, summary, tags, birthYear?, deathYear? }
//
// WICHTIG:
// - birthYear/deathYear sind NICHT Teil des OpenAI-Schemas.
// - Jahre werden serverseitig faktisch aus Wikipedia/Wikidata gezogen.
// - Dadurch kein invalid_json_schema-Fehler mehr.

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
  const slug = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `${slug}.jpg` : "placeholder.jpg";
}

// ---------- OpenAI Structured Output extraction ----------
function extractStructuredJson(data) {
  const outputs = Array.isArray(data?.output) ? data.output : [];

  for (const out of outputs) {
    const content = Array.isArray(out?.content) ? out.content : [];
    for (const c of content) {
      if (c && c.type === "output_json" && typeof c.json === "object") return c.json;
      if (c && typeof c.json === "object") return c.json;
    }
  }

  for (const out of outputs) {
    const content = Array.isArray(out?.content) ? out.content : [];
    for (const c of content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c.text === "string") {
        try {
          return JSON.parse(c.text.trim());
        } catch {}
      }
    }
  }

  if (typeof data?.output_text === "string") {
    try {
      return JSON.parse(data.output_text.trim());
    } catch {}
  }

  return null;
}

// ---------- Wikipedia helpers ----------
async function wikipediaUrlForTitle(title) {
  const encoded = encodeURIComponent(String(title).replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "spacesettlement-index/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.type === "disambiguation") return null;
    return data?.content_urls?.desktop?.page || null;
  } catch {
    return null;
  }
}

async function wikipediaQidForTitle(title) {
  const url =
    "https://en.wikipedia.org/w/api.php" +
    `?action=query&format=json&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=${encodeURIComponent(title)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "spacesettlement-index/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = pages[Object.keys(pages)[0]];
    const qid = page?.pageprops?.wikibase_item;
    return typeof qid === "string" ? qid : null;
  } catch {
    return null;
  }
}

function yearFromWikidataTime(t) {
  if (typeof t !== "string") return null;
  const m = t.match(/^([+-])(\d+)-/);
  return m ? parseInt(m[2], 10) : null;
}

async function wikidataYearsForQid(qid) {
  if (!qid) return null;
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "spacesettlement-index/1.0",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const entity = data?.entities?.[qid];
    if (!entity) return null;

    const claims = entity.claims || {};
    const birth = claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;
    const death = claims.P570?.[0]?.mainsnak?.datavalue?.value?.time;

    return {
      birthYear: yearFromWikidataTime(birth),
      deathYear: yearFromWikidataTime(death),
    };
  } catch {
    return null;
  }
}

// ---------- Handler ----------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return text(405, "Method Not Allowed");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return text(500, "OPENAI_API_KEY missing");

  let req;
  try {
    req = JSON.parse(event.body || "{}");
  } catch {
    return text(400, "Invalid JSON body");
  }

  const title = String(req.title || "").trim();
  const type = String(req.type || "topic").trim();
  const current = typeof req.current === "object" ? req.current : {};

  if (!title) return text(400, "Missing title");

  const tagPattern = "^[a-z0-9][a-z0-9_-]*$";
  const imagePattern = "^[a-z0-9][a-z0-9_]*\\.jpg$";

  // --- OpenAI schema (NO birthYear / deathYear here) ---
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      href: { type: "string", minLength: 1 },
      image: { type: "string", pattern: imagePattern },
      summary: { type: "string", minLength: 20, maxLength: 280 },
      tags: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: { type: "string", minLength: 2, maxLength: 24, pattern: tagPattern },
      },
    },
    required: ["type", "title", "href", "image", "summary", "tags"],
  };

  const instructions =
    "You help fill entries for a space-settlement index.\n" +
    "Be factual and neutral. Do not invent facts.\n" +
    "- href may be a placeholder; server overwrites it.\n" +
    "- image: lowercase placeholder filename from title.\n" +
    "- Summary: English, short, answer:\n" +
    "  (1) Why is the person recognized among scientists?\n" +
    "  (2) What is their contribution to space settlement?\n" +
    "- Tags: 2–6 lowercase slug tags.\n" +
    "- Do NOT include birthYear or deathYear.";

  const input =
    `type: ${type}\n` +
    `title: ${title}\n` +
    `current:\n${JSON.stringify(current, null, 2)}\n`;

  const openaiPayload = {
    model: "gpt-4o-mini",
    instructions,
    input,
    temperature: 0.2,
    text: {
      format: {
        type: "json_schema",
        name: "autofill_v5",
        strict: true,
        schema,
      },
    },
  };

  try {
    const wikiUrlPromise = wikipediaUrlForTitle(title);
    const yearsPromise =
      type === "person"
        ? (async () => {
            const qid = await wikipediaQidForTitle(title);
            return qid ? await wikidataYearsForQid(qid) : null;
          })()
        : Promise.resolve(null);

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
    if (!extracted) return text(500, "Could not extract structured JSON");

    const [wikiUrl, years] = await Promise.all([wikiUrlPromise, yearsPromise]);

    const obj = { ...extracted };
    obj.type = type;
    obj.title = title;
    obj.href = wikiUrl || "kein Wiki";
    obj.image = obj.image || toImagePlaceholder(title);

    if (obj.summary.length < 20) {
      obj.summary =
        "Recognition among scientists: not established from provided context. Contribution to space settlement: not established from provided context.";
    }

    const clean = (t) =>
      String(t).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
    obj.tags = [...new Set(obj.tags.map(clean))].slice(0, 6);

    if (type === "person" && years) {
      if (typeof years.birthYear === "number") obj.birthYear = years.birthYear;
      obj.deathYear = typeof years.deathYear === "number" ? years.deathYear : null;
    }

    return json(200, obj);
  } catch (err) {
    return text(500, `Function error: ${err?.message || err}`);
  }
};
