interface Env {
  DB: D1Database;
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --- CORS headers ---
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- ROUTES ---

// GET /items (D1)
if (request.method === "GET" && url.pathname === "/items") {
  const rs = await env.DB
    .prepare(
      "SELECT id, type, title, href, imageUrl, summary, tags, birthYear, deathYear FROM items ORDER BY createdAt DESC"
    )
    .all();

  const items = (rs.results || []).map((row: any) => ({
    type: row.type,
    title: row.title,
    href: row.href || "",
    image: row.imageUrl || "",
    summary: row.summary || "",
    tags: row.tags ? JSON.parse(row.tags) : [],
    birthYear: row.birthYear ?? undefined,
    deathYear: row.deathYear ?? undefined,
  }));

  return new Response(JSON.stringify(items), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}


    // Fallback
    return new Response(
      JSON.stringify({ error: "Not found", path: url.pathname }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  },
};
