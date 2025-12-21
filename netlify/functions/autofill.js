// netlify/functions/autofill.js
// Netlify Function: CORS + OpenAI Responses API (Structured Outputs / JSON Schema)
// Returns JSON: { type, title, href, image, summary, tags, birthYear?, deathYear? }
//
// Changes:
// - href comes from Wikipedia REST summary endpoint if exists; else "kein Wiki".
// - birthYear/deathYear for persons are fetched from Wikidata via Wikipedia -> QID mapping.
// - Model is instructed NOT to invent facts and NOT to "look up" years.

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

// Extract JSON from Responses API result (Structured Outputs).
function extractStructuredJson(data) {
  const outputs = Array.isArray(data?.output) ? data.output : [];

  for (const out of outputs) {
    const content = Array.isArray(out?.content) ? out.content : [];
    for (const c of content) {
      if (c && c.type === "output_json" && c.json && typeof c.json === "object") return c.json;
      if (c && c.json && typeof c.json === "object") return c.json;
    }
  }

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

// Wikipedia lookup via REST summary endpoint -> canonical page URL or null.
async function wikipediaUrlForTitle(title) {
  const t = String(title || "").trim();
  if (!t) return null;

  const encoded = encodeURIComponent(t.replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "spacesettlement-index/1.0 (Netlify Function)",
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (data?.type === "disambiguation") return null;

    const pageUrl = data?.content_urls?.desktop?.page;
    return typeof pageUrl === "string" && pageUrl.startsWith("http") ? pageUrl : null;
  } catch {
    return null;
  }
}

/**
 * Wikipedia -> Wikidata QID via MediaWiki API.
 * Returns e.g. "Q317521" or null.
 */
async function wikipediaQidForTitle(title) {
  const t = String(title || "").trim();
  if (!t) return null;

  // MediaWiki API expects spaces, not underscores, but either usually works.
  const url =
    "https://en.wikipedia.org/w/api.php" +
    `?action=query&format=json&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=${encodeURIComponent(t)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "spacesettlement-index/1.0 (Netlify Function)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages || typeof pages !== "object") return null;

    const firstKey = Object.keys(pages)[0];
    const page = pages[firstKey];
    const qid = page?.pageprops?.wikibase_item;

    return typeof qid === "string" && /^Q\d+$/.test(qid) ? qid : null;
  } catch {
    return null;
  }
}

/**
 * Parse Wikidata "time" string like "+1971-06-28T00:00:00Z" -> 1971
 */
function yearFromWikidataTime(t) {
  if (typeof t !== "string") return null;
  // Match leading sign + year
  const m = t.match(/^([+-])(\d{1,})-/);
  if (!m) return null;
  const year = parseInt(m[2], 10);
  return Number.isFinite(year) ? year : null;
}

/**
 * Fetch birth/death years from Wikidata claims.
 * P569 = date of birth, P570 = date of death.
 * Returns { birthYear: number|null, deathYear: number|null } or null on failure.
 */
async function wikidataYearsForQid(qid) {
  if (!qid) return null;

  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "spacesettlement-index/1.0 (Netlify Function)",
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

    const birthYear = yearFromWikidataTime(birth);
    const deathYear = yearFromWikidataTime(death);

    return {
      birthYear: birthYear ?? null,
      deathYear: deathYear ?? null,
    };
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
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

  const tagPattern = "^[a-z0-9][a-z0-9_-]*$";
  const imagePattern = "^[a-z0-9][a-z0-9_]*\\.jpg$";

  // NOTE: For persons we do NOT require the model to provide years.
  // Years are pulled factually from Wikidata and then enforced below.
  const baseRequired = ["type", "title", "href", "image", "summary", "tags"];

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
      // Optional in schema; server will add for persons if available.
      birthYear: { type: "integer", minimum: 0, maximum: 2100 },
      deathYear: {
        anyOf: [{ type: "integer", minimum: 0, maximum: 2100 }, { type: "null" }],
      },
    },
    required: [...baseRequired],
  };

  const instructions =
    "You help fill entries for a space-settlement index.\n" +
    "Be factual and neutral.\n" +
    "IMPORTANT: Do not invent facts.\n" +
    "Output valid JSON matching the schema.\n" +
    "Rules:\n" +
    "- href: you may leave as placeholder; server overwrites with Wikipedia URL or 'kein Wiki'.\n" +
    "- image: placeholder filename from title: firstname_lastname.jpg (lowercase, underscores). No folders.\n" +
    "- Summary: English, short, and MUST answer:\n" +
    "  (1) Why is the person recognized among scientists?\n" +
    "  (2) What is their contribution to space settlement?\n" +
    "  If either is not verifiable from the provided context, explicitly say so.\n" +
    "- Tags: 2–6 short lowercase slug tags (letters/numbers/underscore/hyphen only).\n" +
    "- Do not add birthYear/deathYear unless you are certain. The server will fetch years from Wikidata when possible.\n";

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
        name: "autofill_v4",
        strict: true,
        schema,
      },
    },
  };

  try {
    // Wikipedia URL + Wikidata years in parallel
    const wikiUrlPromise = wikipediaUrlForTitle(title);
    const yearsPromise =
      type === "person"
        ? (async () => {
            const qid = await wikipediaQidForTitle(title);
            if (!qid) return null;
            return await wikidataYearsForQid(qid);
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
    if (!extracted) {
      return text(500, `Could not extract structured JSON from OpenAI response.\nRAW:\n${raw}`);
    }

    const [wikiUrl, years] = await Promise.all([wikiUrlPromise, yearsPromise]);

    const obj = { ...extracted };

    obj.type = String(obj.type || type || "topic");
    obj.title = title;

    obj.href = wikiUrl || "kein Wiki";
    obj.image = String(obj.image || toImagePlaceholder(title));

    obj.summary = String(obj.summary || "").trim();
    if (obj.summary.length < 20) {
      obj.summary =
        "Recognition among scientists: not established from provided context. Contribution to space settlement: not established from provided context.";
    }

    const cleanTag = (t) =>
      String(t || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "")
        .replace(/^_+|_+$/g, "");

    let tags = Array.isArray(obj.tags) ? obj.tags.map(cleanTag).filter(Boolean) : [];
    tags = [...new Set(tags)].slice(0, 6);

    const pad = ["space_settlement", "spaceflight", "reference", "biography"];
    while (tags.length < 2 && pad.length) {
      const next = pad.shift();
      if (next && !tags.includes(next)) tags.push(next);
    }
    obj.tags = tags.slice(0, 6);

    // Enforce factual years for persons from Wikidata if available.
    if (type === "person") {
      if (years && typeof years.birthYear === "number") {
        obj.birthYear = years.birthYear;
      }
      // deathYear: integer if deceased, otherwise null if no P570
      if (years) {
        obj.deathYear = typeof years.deathYear === "number" ? years.deathYear : null;
      }
    }

    return json(200, obj);
  } catch (err) {
    return text(500, `Function error: ${err?.message || err}`);
  }
};
