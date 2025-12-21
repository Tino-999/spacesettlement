// netlify/functions/items.js
const { getStore } = require("@netlify/blobs");
const { randomUUID } = require("node:crypto");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400", // 24 hours
};

function json(status, obj) {
  return {
    statusCode: status,
    headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function text(status, body) {
  return {
    statusCode: status,
    headers: HEADERS,
    body: String(body ?? ""),
  };
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter(Boolean);
}

function authOk(event) {
  const required = process.env.ADMIN_TOKEN;
  if (!required) return true; // open if not set
  const token = event.headers["x-admin-token"] || event.headers["X-Admin-Token"];
  return token === required;
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: HEADERS,
      body: "",
    };
  }

  const store = getStore({ name: "kb-items" });

  // ---------------- 
  // GET: list items
  // ----------------
  if (event.httpMethod === "GET") {
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
  if (event.httpMethod === "POST") {
    if (!authOk(event)) return text(401, "Unauthorized");

    let item;
    try {
      item = JSON.parse(event.body || "{}");
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
  if (event.httpMethod === "DELETE") {
    if (!authOk(event)) return text(401, "Unauthorized");

    const params = event.queryStringParameters || {};
    const key = params.key;
    const id = params.id;

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
