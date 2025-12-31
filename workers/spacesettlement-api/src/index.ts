interface Env {
  DB: D1Database;
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const projectClass = url.searchParams.get("project_class");
    const fictionClass = url.searchParams.get("fiction_class");
    const topic = url.searchParams.get("topic");


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
if (request.method === "GET" && url.pathname.startsWith("/items")) {
let sql =
  "SELECT id, type, title, href, imageUrl, summary, tags, birthYear, deathYear, project_class, fiction_class, topics " +
  "FROM items";

const conditions: string[] = [];
const params: any[] = [];

// type filter
if (type) {
  conditions.push("type = ?");
  params.push(type);
}

// project_class filter
if (projectClass) {
  conditions.push("project_class = ?");
  params.push(projectClass);
}

// fiction_class filter
if (fictionClass) {
  conditions.push("fiction_class = ?");
  params.push(fictionClass);
}

// topic filter
if (topic) {
  conditions.push("topics LIKE ?");
  params.push(`%${topic}%`);
}

if (conditions.length > 0) {
  sql += " WHERE " + conditions.join(" AND ");
}

sql += " ORDER BY createdAt DESC";

const rs = await env.DB.prepare(sql).bind(...params).all();


const items = (rs.results || []).map((row: any) => ({
  type: row.type,
  title: row.title,
  href: row.href || "",
  image: row.imageUrl || "",
  summary: row.summary || "",
  tags: row.tags ? JSON.parse(row.tags) : [],
  birthYear: row.birthYear ?? undefined,
  deathYear: row.deathYear ?? undefined,

  // additiv
  project_class: row.project_class ?? null,
  fiction_class: row.fiction_class ?? null,
  topics: row.topics ?? null,
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
