// Drop-in integration snippet for workers/spacesettlement-api/src/index.ts
// Intended use: copy the helpers and route block into index.ts.

export async function resolveWikipediaUrl(title: string): Promise<string | null> {
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
    if (!r.ok) return null;

    const data = (await r.json()) as any;
    const urls: string[] = Array.isArray(data?.[3]) ? data[3] : [];
    return urls[0] ? String(urls[0]) : null;
  } catch {
    return null;
  }
}

export async function enrichMetadata(title: string, type: string, env: any, preferredExternalLink?: string | null) {
  const wikipediaUrl = preferredExternalLink || (await resolveWikipediaUrl(title)) || "";
  const apiKey = (env.OPENAI_API_KEY || "").trim();

  if (!apiKey) {
    return {
      href: wikipediaUrl,
      wikipediaUrl,
      summary: "",
      tags: [],
    };
  }

  const model = (env.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
  const sys =
    "You write factual, neutral, non-speculative metadata for a space-settlement knowledge base. " +
    "No opinions. No predictions. No marketing language. Return JSON only.";
  const user =
    "Create metadata for an entry.\n" +
    `title: ${title}\n` +
    `type: ${type}\n` +
    `preferred_external_link: ${wikipediaUrl}\n\n` +
    "Output JSON with keys: href, summary_de, tags.\n" +
    "- href: use preferred_external_link if available, otherwise leave empty.\n" +
    "- summary_de: German summary, max 60 words, declarative sentences only.\n" +
    "- tags: 5-10 English tags, lowercase, no duplicates.\n";

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
    throw new Error(`OpenAI error: ${r.status} ${err}`);
  }

  const data = (await r.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content || "{}");

  return {
    href: String(parsed?.href || wikipediaUrl || "").trim(),
    wikipediaUrl,
    summary: String(parsed?.summary_de || "").trim(),
    tags: Array.isArray(parsed?.tags)
      ? parsed.tags.map((x: any) => String(x).trim()).filter(Boolean)
      : [],
  };
}

export async function insertItemRecord(input: any, env: any) {
  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    type: String(input?.type || "").trim(),
    title: String(input?.title || "").trim(),
    href: String(input?.href || "").trim(),
    imageUrl: String(input?.imageUrl || "").trim(),
    summary: String(input?.summary || "").trim(),
    tags: Array.isArray(input?.tags) ? input.tags : [],
    meta: input?.meta ?? null,
    project_class: input?.project_class ?? null,
    fiction_class: input?.fiction_class ?? null,
    startYear: input?.startYear ?? null,
    endYear: input?.endYear ?? null,
    sortYear: input?.sortYear ?? null,
    budgetBillionUSD: input?.budgetBillionUSD ?? null,
    createdAt: now,
  };

  await env.DB.prepare(
    "INSERT INTO items (id, type, title, href, imageUrl, summary, tags, meta, project_class, fiction_class, startYear, endYear, sortYear, budgetBillionUSD, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
      item.budgetBillionUSD,
      item.createdAt
    )
    .run();

  const titleKey = `item.${item.id}.title`;
  const summaryKey = `item.${item.id}.summary`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'title', ?, ?)"
  ).bind(titleKey, item.id, item.title, item.title).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO i18n_texts (key, lang, entry_id, field, draft, published) VALUES (?, 'de', ?, 'summary', ?, ?)"
  ).bind(summaryKey, item.id, item.summary, item.summary).run();

  return item;
}

// Route block for index.ts
// Insert before the final fallback.
export const movieIngestRouteExample = `
if (request.method === "POST" && path === "/ingest/movie") {
  const guard = requireAdmin(request, env);
  if (guard) return guard;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const title = String(body?.title || "").trim();
  const submittedUrl = String(body?.url || body?.href || "").trim();
  const note = String(body?.note || "").trim();
  const imageUrl = String(body?.imageUrl || "").trim();

  if (!title) return json({ error: "Missing title" }, 400);

  const enriched = await enrichMetadata(title, "movie", env, submittedUrl || null);
  const item = await insertItemRecord({
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

  return json({ ok: true, item, enrichment: enriched }, 200);
}
`;
