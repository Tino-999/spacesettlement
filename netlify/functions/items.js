// netlify/functions/items.js
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter(Boolean);
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: HEADERS });
  }

  const store = getStore({ name: "kb-items" });

  // ----------------
  // GET: list items
  // ----------------
  if (req.method === "GET") {
    const listed = await store.list({ prefix: "items/" });
    const keys = listed.blobs.map((b) => b.key);

    const items = (await Promise.all(
      keys.map(async (key) => {
        const obj = await store.getJSON(key);
        return obj ? { ...obj } : null;
      })
    )).filter(Boolean);

    // newest first
    items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // ----------------
  // POST: publish
  // ----------------
  if (req.method === "POST") {
    // Optional auth
    const tokenRequired = process.env.ADMIN_TOKEN;
    if (tokenRequired) {
      const token = req.headers.get("x-admin-token");
      if (token !== tokenRequired) {
        return new Response("Unauthorized", { status: 401, headers: HEADERS });
      }
    }

    let item;
    try {
      item = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: HEADERS });
    }

    if (!item || !isNonEmptyString(item.title) || !isNonEmptyString(item.type) || !isNonEmptyString(item.href)) {
      return new Response("Missing required fields (type,title,href)", { status: 400, headers: HEADERS });
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

    return new Response(JSON.stringify({ ok: true, id }), {
      status: 200,
      headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // ----------------
  // DELETE (optional)
  // ----------------
  if (req.method === "DELETE") {
    const tokenRequired = process.env.ADMIN_TOKEN;
    if (tokenRequired) {
      const token = req.headers.get("x-admin-token");
      if (token !== tokenRequired) {
        return new Response("Unauthorized", { status: 401, headers: HEADERS });
      }
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!isNonEmptyString(id)) {
      return new Response("Missing id", { status: 400, headers: HEADERS });
    }

    await store.delete(`items/${id}.json`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
    });
  }

  return new Response("Method Not Allowed", { status: 405, headers: HEADERS });
};
