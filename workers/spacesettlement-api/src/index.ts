// src/index.ts

export interface Env {
  DB: D1Database;
  // Set via: wrangler secret put ADMIN_TOKEN
  ADMIN_TOKEN?: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-admin-token",
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

function noContent(status = 204) {
  return new Response(null, { status, headers: { ...CORS_HEADERS } });
}

function requireAdmin(request: Request, env: Env): Response | null {
  const configured = (env.ADMIN_TOKEN || "").trim();
  if (!configured) {
    return json({ error: "Server misconfigured: missing ADMIN_TOKEN" }, 500);
  }

  const token = (request.headers.get("x-admin-token") || "").trim();
  if (!token) return json({ error: "Missing x-admin-token" }, 401);
  if (token !== configured) return json({ error: "Invalid admin token" }, 403);
  return null;
}

type Item = {
  id?: string;
  type: string;
  title: string;
  href?: string;
  imageUrl?: string;
  summary?: string;
  tags?: string[];
  meta?: any | null;
  project_class?: string | null;
  fiction_class?: string | null;
  createdAt?: string;
};

function normalizeType(t: unknown) {
  const s = String(t || "").trim().toLowerCase();
  if (s === "books") return "book";
  if (s === "people") return "person";
  return s;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") return noContent(204);

    const url = new URL(request.url);
    const path = url.pathname;

    // -----------------------
    // GET /items
    // Returns: { items: [...] }  (matches editor.js expectation)
    // -----------------------
    if (request.method === "GET" && path === "/items") {
      const type = url.searchParams.get("type");
      const projectClass = url.searchParams.get("project_class");
      const fictionClass = url.searchParams.get("fiction_class");

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

      if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
      sql += " ORDER BY createdAt DESC";

      const rs = await env.DB.prepare(sql).bind(...params).all();

      const items: Item[] = (rs.results || []).map((row: any) => ({
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
        createdAt: row.createdAt ?? undefined,
      }));

      return json({ items });
    }

    // -----------------------
    // POST /items  (publish)
    // Body: Item (without id)
    // Returns: inserted item with id
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

      const item: Item = {
        id: crypto.randomUUID(),
        type,
        title,
        href: String(body?.href || "").trim(),
        imageUrl: String(body?.imageUrl || "").trim(),
        summary: String(body?.summary || "").trim(),
        tags: Array.isArray(body?.tags) ? body.tags.map((x: any) => String(x).trim()).filter(Boolean) : [],
        meta: body?.meta ?? null,
        project_class: body?.project_class ?? null,
        fiction_class: body?.fiction_class ?? null,
        createdAt: new Date().toISOString(),
      };

      await env.DB.prepare(
        "INSERT INTO items (id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, createdAt) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          item.id,
          item.type,
          item.title,
          item.href || "",
          item.imageUrl || "",
          item.summary || "",
          JSON.stringify(item.tags || []),
          item.meta == null ? null : JSON.stringify(item.meta),
          item.project_class ?? null,
          item.fiction_class ?? null,
          item.createdAt
        )
        .run();

      return json(item, 200);
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

    // Fallback
    return json({ error: "Not found", path }, 404);
  },
};

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
