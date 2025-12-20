// netlify/functions/items.js
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(status, body) {
  return new Response(String(body ?? ""), { status, headers: HEADERS });
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter(Boolean);
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: HEADERS });

  const store = getStore({ name: "kb-items" });

  // ----------------
  // GET: list items
  // ----------------
  if (req.method === "GET") {
    try {
      const listed = await store.list({ prefix: "items/" });
      const keys = (listed?.blobs || []).map((b) => b.key).filter(Boolean);

      const items = (await Promise.all(
        keys.map(async (key) => {
          const raw = await store.get(key); // <- IMPORTANT: no getJSON()
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            // If a non-JSON blob exists under items/, ignore it
            return null;
          }
        })
      )).filter(Boolean);

      // newest first (if createdAt exists)
      items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

      return json(200, { ok: true, items });
    } catch (e) {
      return json(500, { ok: false, error: e?.message || String(e) });
    }
  }

  // ----------------
  // POST: publish/save
  // ----------------
  if (req.method === "POST") {
    // Optional auth (you said: leave it off for now)
    const tokenRequired = process.env.ADMIN_TOKEN;
    if (tokenRequired) {
      const token = req.headers.get("x-admin-token");
      if (token !== tokenRequired) return text(401, "Unauthorized");
    }

    let item;
    try {
      item = await req.json();
    } catch {
      return text(400, "Invalid JSON");
    }

    if (
      !item ||
      !isNonEmptyString(item.type) ||
      !isNonEmptyString(item.title) ||
      !isNonEmptyString(item.href)
    ) {
      return text(400, "Missing required fields (type,title,href)");
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();

    const stored = {
      ...item,
      id,
      createdAt,
      tags: normalizeTags(item.tags),
    };

    await store.setJSON(`items/${id}.json`, stored);

    return json(200, { ok: true, id });
  }

  // ----------------
  // DELETE: optional
  // ----------------
  if (req.method === "DELETE") {
    const tokenRequired = process.env.ADMIN_TOKEN;
    if (tokenRequired) {
      const token = req.headers.get("x-admin-token");
      if (token !== tokenRequired) return text(401, "Unauthorized");
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!isNonEmptyString(id)) return text(400, "Missing id");

    await store.delete(`items/${id}.json`);
    return json(200, { ok: true });
  }

  return text(405, "Method Not Allowed");
};
