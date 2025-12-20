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

function authOk(req) {
  const required = process.env.ADMIN_TOKEN;
  if (!required) return true; // open if not set
  const token = req.headers.get("x-admin-token");
  return token === required;
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
      const blobs = listed?.blobs || [];

      const items = (await Promise.all(
        blobs.map(async (b) => {
          const key = b.key;
          const raw = await store.get(key);
          if (!raw) return null;
          try {
            const obj = JSON.parse(raw);
            // include internal key so admin can delete safely
            return { ...obj, _key: key };
          } catch {
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
    if (!authOk(req)) return text(401, "Unauthorized");

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
  // DELETE: delete by key (preferred) or by id
  // ----------------
  if (req.method === "DELETE") {
    if (!authOk(req)) return text(401, "Unauthorized");

    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const id = url.searchParams.get("id");

    if (isNonEmptyString(key)) {
      await store.delete(key);
      return json(200, { ok: true });
    }

    if (isNonEmptyString(id)) {
      await store.delete(`items/${id}.json`);
      return json(200, { ok: true });
    }

    return text(400, "Missing key or id");
  }

  return text(405, "Method Not Allowed");
};
