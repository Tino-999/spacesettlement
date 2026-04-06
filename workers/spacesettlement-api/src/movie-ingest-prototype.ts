export async function handleMovieIngest(request: Request, env: any, helpers: {
  requireAdmin: (request: Request, env: any) => Response | null;
  enrichMetadata: (title: string, type: string, env: any, preferredExternalLink?: string | null) => Promise<{ href: string; wikipediaUrl: string; summary: string; tags: string[] }>;
  insertItemRecord: (input: any, env: any) => Promise<any>;
  json: (data: unknown, status?: number) => Response;
}) {
  const guard = helpers.requireAdmin(request, env);
  if (guard) return guard;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return helpers.json({ error: "Invalid JSON body" }, 400);
  }

  const title = String(body?.title || "").trim();
  const submittedUrl = String(body?.url || body?.href || "").trim();
  const note = String(body?.note || "").trim();
  const imageUrl = String(body?.imageUrl || "").trim();

  if (!title) return helpers.json({ error: "Missing title" }, 400);

  try {
    const enriched = await helpers.enrichMetadata(title, "movie", env, submittedUrl || null);
    const item = await helpers.insertItemRecord({
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

    return helpers.json({ ok: true, item, enrichment: enriched }, 200);
  } catch (e: any) {
    return helpers.json({ error: e?.message || "Movie ingest failed" }, 502);
  }
}
