// netlify/functions/items.js
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: HEADERS });
  }

  // Optional simple auth
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

  if (!item || !item.title || !item.type) {
    return new Response("Missing required fields", { status: 400, headers: HEADERS });
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const stored = {
    ...item,
    id,
    createdAt,
  };

  const store = getStore({ name: "kb-items" });
  await store.setJSON(`items/${id}.json`, stored);

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 200,
    headers: { ...HEADERS, "Content-Type": "application/json" },
  });
};
