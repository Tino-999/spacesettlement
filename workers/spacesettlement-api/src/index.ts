// src/index.ts

export interface Env {
DB: D1Database;
IMAGES: R2Bucket;
ADMIN_TOKEN?: string;
OPENAI_API_KEY?: string;
OPENAI_MODEL?: string;
}

type Item = {
id: string;
type: string;
title: string;
href: string;
imageUrl: string;
summary: string;
tags: string[];
meta: any | null;
project_class: string | null;
fiction_class: string | null;
startYear: number | null;
endYear: number | null;
sortYear: number | null;
budgetBillionUSD: number | null;
createdAt: string;
};

const CORS_HEADERS: Record<string, string> = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
"Access-Control-Allow-Headers": "content-type, x-admin-token, authorization",
"Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
return new Response(JSON.stringify(data), {
status,
headers: {
...CORS_HEADERS,
"Content-Type": "application/json; charset=utf-8",
...extraHeaders,
},
});
}

function safeJsonParse<T>(s: string, fallback: T): T {
try {
return JSON.parse(s) as T;
} catch {
return fallback;
}
}

function normalizeType(t: unknown) {
const s = String(t || "").trim().toLowerCase();
if (s === "books") return "book";
if (s === "people") return "person";
return s;
}

function normalizeInt(v: any): number | null {
if (v === null || v === undefined || v === "") return null;
const n = typeof v === "number" ? v : parseInt(String(v), 10);
return Number.isFinite(n) ? n : null;
}

function normalizeFloat(v: unknown): number | null {
if (v == null || v === "") return null;
const n = Number(v);
if (!Number.isFinite(n)) return null;
return n;
}

function requireAdmin(request: Request, env: Env): Response | null {
const configured = (env.ADMIN_TOKEN || "").trim();
if (!configured) return json({ error: "Server misconfigured: missing ADMIN_TOKEN" }, 500);

const token = (request.headers.get("x-admin-token") || "").trim();
if (!token) return json({ error: "Missing x-admin-token" }, 401);
if (token !== configured) return json({ error: "Invalid admin token" }, 403);

return null;
}

async function translateDeToEn(deText: string, env: Env): Promise<string> {
  const apiKey = (env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("Server misconfigured: missing OPENAI_API_KEY");

  const model = (env.OPENAI_MODEL || "gpt-4.1-mini").trim();

  const payload = {
    model,
    messages: [
      { role: "system", content: "Translate German UI/content text to English. Preserve meaning. Keep style neutral and concise. Do not add content." },
      { role: "user", content: deText }
    ],
    temperature: 0.2
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`OpenAI error: ${r.status} ${t}`);
  }

  const data: any = await r.json();
  const out = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!out) throw new Error("Empty translation result");
  return out;
}

export async function resolveWikipediaUrl(title: string): Promise<string | null> {
  try {
    const wp = new URL("https://en.wikipedia.org/w/api.php");
    wp.searchParams.set("action", "opensearch");
    wp.searchParams.set("search", title);
    wp.searchParams.set("limit", "1");
    wp.searchParams.set("namespace", "0");
    wp.searchParams.set("format", "json");

    const r = await fetch(wp.toString(), {
      headers: { "User-Agent": "spacesettlement-api" },
    });
    if (!r.ok) return null;

    const data = (await r.json()) as any;
    const urls: string[] = Array.isArray(data?.[3]) ? data[3] : [];
    return urls[0] ? String(urls[0]) : null;
  } catch {
    return null;
  }
}

export async function enrichMetadata(title: string, type: string, env: any, preferredExternalLink?: string | null) {
  const wikipediaUrl = preferredExternalLink || (await resolveWikipediaUrl(title)) || "";
  const apiKey = (env.OPENAI_API_KEY || "").trim();

  if (!apiKey) {
    return {
      href: wikipediaUrl,
      wikipediaUrl,
      summary: "",
      tags: [],
    };
  }

  const model = (env.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
  const sys =
    "You write factual, neutral, non-speculative metadata for a space-settlement knowledge base. " +
    "No opinions. No predictions. No marketing language. Return JSON only.";
  const user =
    "Create metadata for an entry.\n" +
    `title: ${title}\n` +
    `type: ${type}\n` +
    `preferred_external_link: ${wikipediaUrl}\n\n` +
    "Output JSON with keys: href, summary_de, tags.\n" +
    "- href: use preferred_external_link if available, otherwise leave empty.\n" +
    "- summary_de: German summary, max 60 words, declarative sentences only.\n" +
    "- tags: 5-10 English tags, lowercase, no duplicates.\n";

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI error: ${r.status} ${err}`);
  }

  const data = (await r.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content || "{}");

  return {
    href: String(parsed?.href || wikipediaUrl || "").trim(),
    wikipediaUrl,
    summary: String(parsed?.summary_de || "").trim(),
    tags: Array.isArray(parsed?.tags)
      ? parsed.tags.map((x: any) => String(x).trim()).filter(Boolean)
      : [],
  };
}

export async function insertItemRecord(input: any, env: any) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    type: String(input?.type || "").trim(),
    title: String(input?.title || "").trim(),
    href: String(input?.href || "").trim(),
    imageUrl: String(input?.imageUrl || "").trim(),
    summary: String(input?.summary || "").trim(),
    tags: Array.isArray(input?.tags) ? input.tags : [],
    meta: input?.meta ?? null,
    project_class: input?.project_class ?? null,
    fiction_class: input?.fiction_class ?? null,
    startYear: input?.startYear ?? null,
    endYear: input?.endYear ?? null,
    sortYear: input?.sortYear ?? null,
    budgetBillionUSD: input?.budgetBillionUSD ?? null,
    createdAt: now,
  };

  await env.DB.prepare(
    "INSERT INTO items (id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, startYear, endYear, sortYear, budgetBillionUSD, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      item.id,
      item.type,
      item.title,
      item.href,
      item.imageUrl,
      item.summary,
      JSON.stringify(item.tags),
      item.meta == null ? null : JSON.stringify(item.meta),
      item.project_class,
      item.fiction_class,
      item.startYear,
      item.endYear,
      item.sortYear,
      item.budgetBillionUSD,
      item.createdAt
    )
    .run();

  const titleKey = `item.${item.id}.title`;
  const summaryKey = `item.${item.id}.summary`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'title', ?, ?)"
  ).bind(titleKey, item.id, item.title, item.title).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'summary', ?, ?)"
  ).bind(summaryKey, item.id, item.summary, item.summary).run();

  return item;
}


export default {
async fetch(request: Request, env: Env): Promise<Response> {
try {
// CORS preflight
if (request.method === "OPTIONS") {
return new Response(null, {
status: 204,
headers: CORS_HEADERS,
});
}

const url = new URL(request.url);
const path = url.pathname;

// -----------------------
// i18n (public)
// GET /i18n/de.json
// GET /i18n/en.json
// Returns { key: publishedString } for the requested language.
// -----------------------
if (request.method === "GET" && (path === "/i18n/de.json" || path === "/i18n/en.json")) {
  const lang = path.endsWith("de.json") ? "de" : "en";
  const rows = await env.DB.prepare(
    "SELECT key, published FROM i18n_texts WHERE lang = ? AND published IS NOT NULL AND TRIM(published) != ''"
  ).bind(lang).all();
  const out: Record<string, string> = {};
  for (const r of (rows.results || []) as any[]) {
    out[String(r.key)] = String(r.published);
  }
  return json(out, 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60",
  });
}

// -----------------------
// i18n (admin)
// GET /admin/i18n?entry_id=<id>  -> returns rows for one entry (or global if entry_id missing)
// PUT /admin/i18n               -> upsert draft/published for one key+lang
// POST /admin/i18n/publish      -> { key, lang } sets published = draft
// POST /admin/i18n/translate/en -> { key } uses de.published -> en.draft
// -----------------------
if (path.startsWith("/admin/i18n")) {
  const guard = requireAdmin(request, env);
  if (guard) return guard;

  if (request.method === "GET" && path === "/admin/i18n") {
    const entryId = String(url.searchParams.get("entry_id") || "").trim();
    const q = entryId
      ? env.DB.prepare("SELECT key, lang, field, draft, published, updated_at FROM i18n_texts WHERE entry_id = ? ORDER BY field, lang").bind(entryId)
      : env.DB.prepare("SELECT key, lang, field, draft, published, updated_at FROM i18n_texts WHERE entry_id IS NULL ORDER BY field, lang");
    const rows = await q.all();
    return json({ rows: rows.results || [] }, 200);
  }

  if (request.method === "PUT" && path === "/admin/i18n") {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
    const key = String(body?.key || "").trim();
    const lang = String(body?.lang || "").trim();
    const field = String(body?.field || "").trim();
    const entry_id = body?.entry_id == null ? null : String(body.entry_id).trim();
    const draft = body?.draft == null ? null : String(body.draft);
    const published = body?.published == null ? null : String(body.published);
    if (!key) return json({ error: "Missing key" }, 400);
    if (lang !== "de" && lang !== "en") return json({ error: "Invalid lang" }, 400);
    if (!field) return json({ error: "Missing field" }, 400);

    await env.DB.prepare(
      "INSERT INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(key, lang) DO UPDATE SET entry_id=excluded.entry_id, field=excluded.field, draft=excluded.draft, published=COALESCE(excluded.published, i18n_texts.published)"
    ).bind(key, lang, entry_id, field, draft, published).run();

    return json({ ok: true }, 200);
  }

  if (request.method === "POST" && path === "/admin/i18n/publish") {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
    const key = String(body?.key || "").trim();
    const lang = String(body?.lang || "").trim();
    if (!key) return json({ error: "Missing key" }, 400);
    if (lang !== "de" && lang !== "en") return json({ error: "Invalid lang" }, 400);

    // Set published = draft
    await env.DB.prepare(
      "UPDATE i18n_texts SET published = draft WHERE key = ? AND lang = ?"
    ).bind(key, lang).run();

    // If this is an item title/summary in DE, keep items.title/items.summary in sync for existing UI.
    if (lang === "de") {
      const m = /^item\.([0-9a-fA-F-]+)\.(title|summary)$/.exec(key);
      if (m) {
        const itemId = m[1];
        const field = m[2];
        const row = await env.DB.prepare("SELECT published FROM i18n_texts WHERE key = ? AND lang = 'de'").bind(key).first();
        const val = row?.published == null ? "" : String((row as any).published);
        if (field === "title") {
          await env.DB.prepare("UPDATE items SET title = ? WHERE id = ?").bind(val, itemId).run();
        } else if (field === "summary") {
          await env.DB.prepare("UPDATE items SET summary = ? WHERE id = ?").bind(val, itemId).run();
        }
      }
    }

    return json({ ok: true }, 200);
  }

  if (request.method === "POST" && path === "/admin/i18n/translate/en") {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
    const key = String(body?.key || "").trim();
    if (!key) return json({ error: "Missing key" }, 400);

    const deRow = await env.DB.prepare(
      "SELECT published FROM i18n_texts WHERE key = ? AND lang = 'de'"
    ).bind(key).first();

    const deText = deRow?.published == null ? "" : String((deRow as any).published);
    if (!deText.trim()) return json({ error: "Missing de.published for key" }, 400);

    const enDraft = await translateDeToEn(deText, env);

    await env.DB.prepare(
      "INSERT INTO i18n_texts (key, lang, entry_id, field, draft, published) " +
      "SELECT key, 'en', entry_id, field, ?, published FROM i18n_texts WHERE key = ? AND lang = 'de' " +
      "ON CONFLICT(key, lang) DO UPDATE SET draft=excluded.draft"
    ).bind(enDraft, key).run();

    return json({ ok: true, draft: enDraft }, 200);
  }

  return json({ error: "Not found" }, 404);
}

// -----------------------
// GET /items
// editor.js expects: { items: [...] }
// -----------------------
if (request.method === "GET" && path === "/items") {
const type = url.searchParams.get("type");
const projectClass = url.searchParams.get("project_class");
const fictionClass = url.searchParams.get("fiction_class");
const topic = url.searchParams.get("topic");

let sql =
"SELECT id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, startYear, endYear, sortYear, budgetBillionUSD, createdAt " +
"FROM items";

const conditions: string[] = [];
const params: any[] = [];

// IMPORTANT: treat "ALL" as no filter
if (type && String(type).toUpperCase() !== "ALL") {
conditions.push("type = ?");
params.push(normalizeType(type));
}
if (projectClass) {
conditions.push("project_class = ?");
params.push(projectClass);
}
if (fictionClass) {
conditions.push("fiction_class = ?");
params.push(fictionClass);
}
// topic optional – only if schema supports it (no-op here)
void topic;

if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
sql += " ORDER BY createdAt DESC";

const rs = await env.DB.prepare(sql).bind(...params).all();

const items = (rs.results || []).map((row: any) => ({
id: row.id,
type: row.type,
title: row.title,
href: row.href || "",
imageUrl: row.imageUrl || "",
summary: row.summary || "",
tags: row.tags ? safeJsonParse(row.tags, []) : [],
meta: row.meta ? safeJsonParse(row.meta, null) : null,
project_class: row.project_class ?? null,
fiction_class: row.fiction_class ?? null,
startYear: row.startYear ?? null,
endYear: row.endYear ?? null,
sortYear: row.sortYear ?? null,
budgetBillionUSD: row.budgetBillionUSD ?? null,
createdAt: row.createdAt ?? null,
}));

return json({ items }, 200);
}

// -----------------------
// POST /items (create/publish)
// Body: { type, title, href, imageUrl, summary, tags[], meta, project_class, fiction_class, startYear, endYear, sortYear, budgetBillionUSD }
// -----------------------
if (request.method === "POST" && path === "/items") {
const guard = requireAdmin(request, env);
if (guard) return guard;

let body: any;
try {
body = await request.json();
} catch {
return json({ error: "Invalid JSON body" }, 400);
}

const type = normalizeType(body?.type);
const title = String(body?.title || "").trim();

if (!type) return json({ error: "Missing type" }, 400);
if (!title) return json({ error: "Missing title" }, 400);

const now = new Date().toISOString();

const item: Item = {
id: crypto.randomUUID(),
type,
title,
href: String(body?.href || "").trim(),
imageUrl: String(body?.imageUrl || "").trim(),
summary: String(body?.summary || "").trim(),
tags: Array.isArray(body?.tags)
? body.tags.map((x: any) => String(x).trim()).filter(Boolean)
: [],
meta: body?.meta ?? null,
project_class: body?.project_class ?? null,
fiction_class: body?.fiction_class ?? null,
startYear: normalizeInt(body?.startYear),
endYear: normalizeInt(body?.endYear),
sortYear: normalizeInt(body?.sortYear),
budgetBillionUSD: normalizeFloat(body?.budgetBillionUSD),
createdAt: now,
};

await env.DB.prepare(
"INSERT INTO items (id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, startYear, endYear, sortYear, budgetBillionUSD, createdAt) " +
"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)
.bind(
item.id,
item.type,
item.title,
item.href,
item.imageUrl,
item.summary,
JSON.stringify(item.tags),
item.meta == null ? null : JSON.stringify(item.meta),
item.project_class,
item.fiction_class,
item.startYear,
item.endYear,
item.sortYear,
item.budgetBillionUSD,
item.createdAt
)
.run();


// Create initial i18n rows for title/summary (DE draft+published).
try {
  const titleKey = `item.${item.id}.title`;
  const summaryKey = `item.${item.id}.summary`;

  await env.DB.prepare(
    "INSERT OR IGNORE INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'title', ?, ?)"
  ).bind(titleKey, item.id, item.title, item.title).run();

  await env.DB.prepare(
    "INSERT OR IGNORE INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'summary', ?, ?)"
  ).bind(summaryKey, item.id, item.summary, item.summary).run();
} catch (e) {
  console.warn("[i18n] seed failed", e);
}

return json(item, 200);
}

// -----------------------
// PUT /items (update)
// Query: ?id=<itemId>
// Body: same as POST
// -----------------------
if (request.method === "PUT" && path === "/items") {
const guard = requireAdmin(request, env);
if (guard) return guard;

const id = String(url.searchParams.get("id") || "").trim();
if (!id) return json({ error: "Missing id" }, 400);

let body: any;
try {
body = await request.json();
} catch {
return json({ error: "Invalid JSON body" }, 400);
}

const now = new Date().toISOString();
const type = normalizeType(body?.type);
const title = String(body?.title || "").trim();

if (!type) return json({ error: "Missing type" }, 400);
if (!title) return json({ error: "Missing title" }, 400);

await env.DB.prepare(
"UPDATE items SET type = ?, title = ?, href = ?, imageUrl = ?, summary = ?, tags = ?, meta = ?, project_class = ?, fiction_class = ?, startYear = ?, endYear = ?, sortYear = ?, budgetBillionUSD = ?, createdAt = ? WHERE id = ?"
)
.bind(
type,
title,
String(body?.href || "").trim(),
String(body?.imageUrl || "").trim(),
String(body?.summary || "").trim(),
JSON.stringify(
Array.isArray(body?.tags)
? body.tags.map((x: any) => String(x).trim()).filter(Boolean)
: []
),
body?.meta == null ? null : JSON.stringify(body.meta),
body?.project_class ?? null,
body?.fiction_class ?? null,
normalizeInt(body?.startYear),
normalizeInt(body?.endYear),
normalizeInt(body?.sortYear),
normalizeFloat(body?.budgetBillionUSD),
now,
id
)
.run();

const row = await env.DB.prepare(
"SELECT id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, startYear, endYear, sortYear, budgetBillionUSD, createdAt FROM items WHERE id = ?"
)
.bind(id)
.first();

if (!row) return json({ error: "Not found" }, 404);


// Update DE drafts for title/summary keys (do not auto-publish).
try {
  const titleKey = `item.${id}.title`;
  const summaryKey = `item.${id}.summary`;

  await env.DB.prepare(
    "INSERT INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'title', ?, NULL) " +
    "ON CONFLICT(key, lang) DO UPDATE SET draft=excluded.draft"
  ).bind(titleKey, id, title).run();

  await env.DB.prepare(
    "INSERT INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'summary', ?, NULL) " +
    "ON CONFLICT(key, lang) DO UPDATE SET draft=excluded.draft"
  ).bind(summaryKey, id, String(body?.summary || "").trim()).run();
} catch (e) {
  console.warn("[i18n] update draft failed", e);
}

return json(
{
ok: true,
updated: {
id: (row as any).id,
type: (row as any).type,
title: (row as any).title,
href: (row as any).href || "",
imageUrl: (row as any).imageUrl || "",
summary: (row as any).summary || "",
tags: (row as any).tags ? safeJsonParse((row as any).tags, []) : [],
meta: (row as any).meta ? safeJsonParse((row as any).meta, null) : null,
project_class: (row as any).project_class ?? null,
fiction_class: (row as any).fiction_class ?? null,
startYear: (row as any).startYear ?? null,
endYear: (row as any).endYear ?? null,
sortYear: (row as any).sortYear ?? null,
budgetBillionUSD: (row as any).budgetBillionUSD ?? null,
createdAt: (row as any).createdAt ?? null,
},
},
200
);
}

// -----------------------
// DELETE /items?id=...
// -----------------------
if (request.method === "DELETE" && path === "/items") {
const guard = requireAdmin(request, env);
if (guard) return guard;

const id = (url.searchParams.get("id") || "").trim();
if (!id) return json({ error: "Missing id" }, 400);

await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
return json({ ok: true, deleted: id }, 200);
}

// -----------------------
// POST /upload-image
// multipart/form-data: file
// Returns: { imageUrl }
// -----------------------
if (request.method === "POST" && path === "/upload-image") {
const guard = requireAdmin(request, env);
if (guard) return guard;

let form: FormData;
try {
form = await request.formData();
} catch {
return json({ error: "Invalid form-data body" }, 400);
}

const file = form.get("file");
if (!(file instanceof File)) return json({ error: "Missing file" }, 400);

const buf = await file.arrayBuffer();
const contentType = file.type || "application/octet-stream";
const id = crypto.randomUUID();
const now = new Date().toISOString();

await env.IMAGES.put(id, buf, {
httpMetadata: { contentType },
});

// store only metadata in D1
await env.DB.prepare("INSERT INTO images (id, contentType, data, createdAt) VALUES (?, ?, ?, ?)")
.bind(id, contentType, new Uint8Array(), now)
.run();

const origin = new URL(request.url).origin;
return json({ imageUrl: `${origin}/images/${id}` }, 200);
}

// -----------------------
// GET /images/:id
// -----------------------
if (request.method === "GET" && path.startsWith("/images/")) {
const id = path.slice("/images/".length).trim();
if (!id) return json({ error: "Missing id" }, 400);

const meta = await env.DB.prepare("SELECT contentType FROM images WHERE id = ?").bind(id).first();

const obj = await env.IMAGES.get(id);
if (!obj) return json({ error: "Not found" }, 404);

const contentType =
obj.httpMetadata?.contentType ||
String((meta as any)?.contentType || "application/octet-stream");

return new Response(obj.body, {
status: 200,
headers: {
...CORS_HEADERS,
"Content-Type": contentType,
"Cache-Control": "public, max-age=31536000, immutable",
},
});
}

// -----------------------
// GET /suggest-title?q=...
// Returns: { suggestions: [{ title, href?, source }] }
// -----------------------
if (request.method === "GET" && path === "/suggest-title") {
const q = (url.searchParams.get("q") || "").trim();
if (!q || q.length < 2) return json({ suggestions: [] }, 200);

const local = await env.DB.prepare(
"SELECT title, href FROM items WHERE title LIKE ? ORDER BY createdAt DESC LIMIT 8"
)
.bind(`%${q}%`)
.all();

const seen = new Set<string>();
const suggestions: Array<{ title: string; href?: string; source: string }> = [];

for (const row of (local.results || []) as any[]) {
const t = String(row.title || "").trim();
if (!t) continue;
const k = t.toLowerCase();
if (seen.has(k)) continue;
seen.add(k);
suggestions.push({
title: t,
href: row.href ? String(row.href) : undefined,
source: "local",
});
}

// Wikipedia opensearch (best-effort)
try {
const wp = new URL("https://en.wikipedia.org/w/api.php");
wp.searchParams.set("action", "opensearch");
wp.searchParams.set("search", q);
wp.searchParams.set("limit", "8");
wp.searchParams.set("namespace", "0");
wp.searchParams.set("format", "json");

const r = await fetch(wp.toString(), {
headers: { "User-Agent": "spacesettlement-api" },
});

if (r.ok) {
const data = (await r.json()) as any;
const titles: string[] = Array.isArray(data?.[1]) ? data[1] : [];
const urls: string[] = Array.isArray(data?.[3]) ? data[3] : [];
for (let i = 0; i < titles.length; i++) {
const t = String(titles[i] || "").trim();
if (!t) continue;
const k = t.toLowerCase();
if (seen.has(k)) continue;
seen.add(k);
suggestions.push({
title: t,
href: urls[i] ? String(urls[i]) : undefined,
source: "wikipedia",
});
}
}
} catch {
// ignore
}

return json({ suggestions }, 200);
}

// -----------------------
// POST /ai/enrich
// Body: { title, type }
// Returns: { href, wikipediaUrl, summary, tags[] }
// -----------------------
if (request.method === "POST" && path === "/ai/enrich") {
const guard = requireAdmin(request, env);
if (guard) return guard;

let body: any;
try {
body = await request.json();
} catch {
return json({ error: "Invalid JSON body" }, 400);
}

const title = String(body?.title || "").trim();
const type = normalizeType(body?.type);
if (!title) return json({ error: "Missing title" }, 400);

let wikipediaUrl: string | null = null;

// Wikipedia resolution (priority)
try {
const wp = new URL("https://en.wikipedia.org/w/api.php");
wp.searchParams.set("action", "opensearch");
wp.searchParams.set("search", title);
wp.searchParams.set("limit", "1");
wp.searchParams.set("namespace", "0");
wp.searchParams.set("format", "json");

const r = await fetch(wp.toString(), {
headers: { "User-Agent": "spacesettlement-api" },
});

if (r.ok) {
const data = (await r.json()) as any;
const urls: string[] = Array.isArray(data?.[3]) ? data[3] : [];
wikipediaUrl = urls[0] ? String(urls[0]) : null;
}
} catch {
// ignore
}

const apiKey = (env.OPENAI_API_KEY || "").trim();
if (!apiKey) {
return json(
{
href: wikipediaUrl || "",
wikipediaUrl: wikipediaUrl || "",
summary: "",
tags: [],
},
200
);
}

const model = (env.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";

const sys =
"You write factual, neutral, non-speculative metadata for a space-settlement knowledge base. " +
"No opinions. No predictions. No marketing language. " +
"Return JSON only.";

const user =
"Create metadata for an entry.\n" +
`title: ${title}\n` +
`type: ${type}\n` +
`preferred_external_link: ${wikipediaUrl || ""}\n\n` +
"Output JSON with keys: href, summary_de, tags.\n" +
"- href: use preferred_external_link if available, otherwise leave empty.\n" +
"- summary_de: German summary, max 60 words, declarative sentences only.\n" +
"- tags: 5-10 English tags, lowercase, no duplicates.\n";

try {
const r = await fetch("https://api.openai.com/v1/chat/completions", {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${apiKey}`,
},
body: JSON.stringify({
model,
temperature: 0.2,
response_format: { type: "json_object" },
messages: [
{ role: "system", content: sys },
{ role: "user", content: user },
],
}),
});

if (!r.ok) {
const err = await r.text();
return json({ error: "OpenAI error", status: r.status, detail: err }, 502);
}

const data = (await r.json()) as any;
const content = data?.choices?.[0]?.message?.content;
const parsed = safeJsonParse<any>(content || "{}", {});
const href = String(parsed?.href || wikipediaUrl || "").trim();

const summary = String(parsed?.summary_de || "").trim();
const tags = Array.isArray(parsed?.tags)
? parsed.tags.map((x: any) => String(x).trim()).filter(Boolean)
: [];

return json(
{
href,
wikipediaUrl: wikipediaUrl || "",
summary,
tags,
},
200
);
} catch (e: any) {
return json({ error: "OpenAI request failed", detail: e?.message || String(e) }, 502);
}
}

if (request.method === "POST" && path === "/ingest/movie") {
  const guard = requireAdmin(request, env);
  if (guard) return guard;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const title = String(body?.title || "").trim();
  const submittedUrl = String(body?.url || body?.href || "").trim();
  const note = String(body?.note || "").trim();
  const imageUrl = String(body?.imageUrl || "").trim();

  if (!title) return json({ error: "Missing title" }, 400);

  const enriched = await enrichMetadata(title, "movie", env, submittedUrl || null);
  const item = await insertItemRecord({
    type: "movie",
    title,
    href: submittedUrl || enriched.href || "",
    imageUrl,
    summary: enriched.summary,
    tags: enriched.tags,
    meta: {
      source: "chatgpt-ingest",
      submittedUrl: submittedUrl || null,
      note: note || null,
      wikipediaUrl: enriched.wikipediaUrl || null,
    },
  }, env);

  return json({ ok: true, item, enrichment: enriched }, 200);
}

// Fallback
return json({ error: "Not found", path }, 404);
} catch (err) {
console.error("Worker error:", err);
return json({ error: "Internal Server Error" }, 500);
}
},
};

