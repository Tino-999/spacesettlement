// src/index.ts

export interface Env {
  DB: D1Database;
  // Set via: wrangler secret put ADMIN_TOKEN
  ADMIN_TOKEN?: string;

  // Set via: wrangler secret put OPENAI_API_KEY
  OPENAI_API_KEY?: string;
  // Optional. Default: gpt-4.1-mini
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
  createdAt: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-admin-token",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
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

function requireAdmin(request: Request, env: Env): Response | null {
  const configured = (env.ADMIN_TOKEN || "").trim();
  if (!configured) return json({ error: "Server misconfigured: missing ADMIN_TOKEN" }, 500);

  const token = (request.headers.get("x-admin-token") || "").trim();
  if (!token) return json({ error: "Missing x-admin-token" }, 401);
  if (token !== configured) return json({ error: "Invalid admin token" }, 403);

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // -----------------------
    // GET /items
    // editor.js expects: { items: [...] }
    // -----------------------
    if (request.method === "GET" && path === "/items") {
      const type = url.searchParams.get("type");
      const projectClass = url.searchParams.get("project_class");
      const fictionClass = url.searchParams.get("fiction_class");
      const topic = url.searchParams.get("topic"); // optional, if you store topics somewhere

      let sql =
        "SELECT id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, createdAt " +
        "FROM items";

      const conditions: string[] = [];
      const params: any[] = [];

      if (type) {
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
      // NOTE: topic filter only works if your table has a column for it.
      // If your schema has no topic/topics column, remove this.
      if (topic) {
        // Example if you had a "topics" TEXT column (comma string or json)
        // conditions.push("topics LIKE ?");
        // params.push(`%${topic}%`);
      }

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
        createdAt: row.createdAt ?? null,
      }));

      return json({ items }, 200);
    }

    // -----------------------
    // POST /items  (publish)
    // Body: { type, title, href, imageUrl, summary, tags[], meta, project_class, fiction_class }
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
        createdAt: now,
      };

      await env.DB.prepare(
        "INSERT INTO items (id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, startYear, endYear, sortYear, createdAt) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
          item.createdAt
        )
        .run();

      return json(item, 200);
    }

    // -----------------------
    // DELETE /items?id=...
    // -----------------------
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

      await env.DB.prepare(
        "INSERT INTO images (id, contentType, data, createdAt) VALUES (?, ?, ?, ?)"
      )
        .bind(id, contentType, new Uint8Array(buf), now)
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

      const rs = await env.DB.prepare(
        "SELECT contentType, data FROM images WHERE id = ?"
      )
        .bind(id)
        .first();

      if (!rs) return json({ error: "Not found" }, 404);

      return new Response(rs.data as ArrayBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": String(rs.contentType || "application/octet-stream"),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // -----------------------
    // GET /suggest-title?q=...
    // Returns: { suggestions: [{ title, href? }] }
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
      } catch (_) {}

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
      } catch (_) {}

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
        const parsed = safeJsonParse(content || "{}", {});
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
    if (request.method === "DELETE" && path === "/items") {
      const guard = requireAdmin(request, env);
      if (guard) return guard;

      const id = (url.searchParams.get("id") || "").trim();
      if (!id) return json({ error: "Missing id" }, 400);

      await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
      return json({ ok: true, deleted: id }, 200);
    }

    // Fallback
    return json({ error: "Not found", path }, 404);
  },
};