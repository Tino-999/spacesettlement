// src/render.ts
// Serverseitiges Rendering der Einzelseiten (/item/<id>), sitemap.xml und robots.txt.
//
// Alles, was hier entsteht, steht vollständig im HTML-Quelltext. Kein Nachladen
// per JavaScript. Crawler und Leser ohne JS sehen denselben Text.

export type Lang = "de" | "en";

export const DEFAULT_SITE_ORIGIN = "https://space-settlement.net";

export type RelationRow = {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
  note: string | null;
  source_url: string | null;
  source_checked: string | null;
  created_at: string | null;
  other_id: string;
  other_title: string;
  other_type: string;
  direction: "out" | "in";
};

export type ItemRow = {
  id: string;
  type: string;
  title: string;
  href: string | null;
  imageUrl: string | null;
  summary: string | null;
  tags: string | null;
  verdict: string | null;
  reality: string | null;
  reality_checked: string | null;
  source_url: string | null;
  startYear: number | null;
  endYear: number | null;
  createdAt: string | null;
};

// -----------------------------------------------------------------------
// Escaping
// -----------------------------------------------------------------------
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// JSON-LD wird in ein <script> geschrieben; nur "<" muss entschärft werden.
function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// -----------------------------------------------------------------------
// Wortlisten
// -----------------------------------------------------------------------
const REALITY_LABELS: Record<string, { de: string; en: string }> = {
  in_operation: { de: "in Betrieb", en: "in operation" },
  under_construction: { de: "im Bau", en: "under construction" },
  funded: { de: "finanziert", en: "funded" },
  announced: { de: "angekündigt", en: "announced" },
  dormant: { de: "ruhend", en: "dormant" },
  abandoned: { de: "aufgegeben", en: "abandoned" },
  vision: { de: "Vision", en: "vision" },
  fiction: { de: "Fiktion", en: "fiction" },
};

// Wirkungslinien werden aus Sicht des angezeigten Eintrags formuliert.
// "out": der Eintrag ist from_id. "in": der Eintrag ist to_id.
const RELATION_LABELS: Record<string, { out: { de: string; en: string }; in: { de: string; en: string } }> = {
  triggered_by: {
    out: { de: "ausgelöst durch", en: "triggered by" },
    in: { de: "hat ausgelöst", en: "triggered" },
  },
  influenced: {
    out: { de: "beeinflusst", en: "influenced" },
    in: { de: "beeinflusst von", en: "influenced by" },
  },
  implements: {
    out: { de: "setzt um", en: "implements" },
    in: { de: "umgesetzt durch", en: "implemented by" },
  },
  contradicts: {
    out: { de: "widerspricht", en: "contradicts" },
    in: { de: "wird widersprochen von", en: "contradicted by" },
  },
};

const UI: Record<string, { de: string; en: string }> = {
  verdict: { de: "Urteil", en: "Verdict" },
  reality: { de: "Realitätsgrad", en: "Reality" },
  checked: { de: "geprüft", en: "checked" },
  source: { de: "Beleg", en: "Source" },
  relations: { de: "Wirkungslinien", en: "Lines of effect" },
  noRelations: { de: "Keine Wirkungslinien erfasst.", en: "No lines of effect recorded." },
  externalLink: { de: "Externer Link", en: "External link" },
  index: { de: "Index", en: "Index" },
  notFoundTitle: { de: "Eintrag nicht gefunden", en: "Entry not found" },
  notFoundText: {
    de: "Zu dieser Adresse gibt es keinen Eintrag.",
    en: "There is no entry at this address.",
  },
  backToIndex: { de: "Zurück zum Index", en: "Back to the index" },
  siteName: { de: "Space Settlement Index", en: "Space Settlement Index" },
};

function t(key: string, lang: Lang): string {
  const e = UI[key];
  return e ? e[lang] : key;
}

export function realityLabel(reality: string | null, lang: Lang): string | null {
  if (!reality) return null;
  const e = REALITY_LABELS[reality];
  return e ? e[lang] : reality;
}

export function relationLabel(kind: string, direction: "out" | "in", lang: Lang): string {
  const e = RELATION_LABELS[kind];
  if (!e) return kind;
  return e[direction][lang];
}

// -----------------------------------------------------------------------
// schema.org-Typ. "org" wird auf der Seite als ART geführt und enthält
// sowohl Personen als auch Kollektive — deshalb bewusst das neutrale "Thing".
// -----------------------------------------------------------------------
function schemaType(type: string): string {
  switch (String(type || "").toLowerCase()) {
    case "person":
      return "Person";
    case "book":
      return "Book";
    case "movie":
      return "Movie";
    case "org":
      return "Thing";
    default:
      return "CreativeWork";
  }
}

function safeTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function truncate(s: string, max: number): string {
  const clean = String(s || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

// Absolute Adresse — für canonical, hreflang, OpenGraph, JSON-LD und sitemap.
export function itemUrl(origin: string, id: string, lang: Lang): string {
  return origin + itemPath(id, lang);
}

// Relativer Pfad — für Links im Seitenkörper, damit die Seite auf jedem Host
// (workers.dev, lokal, Produktion) in sich navigierbar bleibt.
export function itemPath(id: string, lang: Lang): string {
  return lang === "en" ? `/item/${id}?lang=en` : `/item/${id}`;
}

// -----------------------------------------------------------------------
// Seiten-Gerüst
// -----------------------------------------------------------------------
function layout(opts: {
  lang: Lang;
  head: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="${opts.lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
${opts.head}
<link rel="stylesheet" href="/assets/css/styles.css" />
<link rel="stylesheet" href="/assets/css/ui-fixes.css" />
<style>
.item-page{max-width:820px;margin:0 auto;padding:40px 20px 80px}
.item-page h1{margin:0 0 6px;line-height:1.15}
.item-page .item-kicker{text-transform:uppercase;letter-spacing:.12em;font-size:12px;opacity:.7;margin-bottom:14px}
.item-page section{margin:28px 0}
.item-page h2{font-size:13px;text-transform:uppercase;letter-spacing:.12em;opacity:.7;margin:0 0 10px;font-weight:600}
.item-page p{line-height:1.6}
.item-verdict{border-left:2px solid currentColor;padding-left:16px;opacity:.95}
.item-figure{margin:0 0 24px}
.item-figure img{max-width:100%;height:auto;display:block}
.item-relations{list-style:none;margin:0;padding:0}
.item-relations li{padding:10px 0;border-bottom:1px solid rgba(128,128,128,.25)}
.item-relations .rel-kind{text-transform:uppercase;letter-spacing:.1em;font-size:11px;opacity:.65;display:block;margin-bottom:2px}
.item-relations .rel-note{display:block;font-size:14px;opacity:.75;margin-top:4px}
.item-meta{font-size:14px;opacity:.75}
.item-tags{font-size:13px;opacity:.6}
.item-page a{color:inherit}
</style>
</head>
<body class="bg">
<header class="topbar">
  <div class="topbar__inner">
    <a class="brand" href="/">SPACESETTLEMENT</a>
    <nav class="nav">
      <a class="nav__link" href="/library">${esc(t("index", opts.lang))}</a>
      <a class="nav__link" href="/pages/about.html">About</a>
    </nav>
  </div>
</header>
<main class="item-page">
${opts.body}
</main>
</body>
</html>
`;
}

// -----------------------------------------------------------------------
// /item/<id>
// -----------------------------------------------------------------------
export function renderItemPage(opts: {
  item: ItemRow;
  relations: RelationRow[];
  lang: Lang;
  origin: string;
  i18nTitle?: string | null;
  i18nSummary?: string | null;
}): string {
  const { item, relations, lang, origin } = opts;

  const title = (opts.i18nTitle || "").trim() || item.title || "";
  const summary = (opts.i18nSummary || "").trim() || item.summary || "";
  const verdict = (item.verdict || "").trim();
  const reality = realityLabel(item.reality, lang);
  const realityChecked = (item.reality_checked || "").trim();
  const sourceUrl = (item.source_url || "").trim();
  const externalHref = (item.href || "").trim();
  const image = (item.imageUrl || "").trim();
  const tags = safeTags(item.tags);

  const canonical = itemUrl(origin, item.id, lang);
  const deUrl = itemUrl(origin, item.id, "de");
  const enUrl = itemUrl(origin, item.id, "en");

  // Beschreibung für OpenGraph: Urteil hat Vorrang, sonst Zusammenfassung.
  const metaDescription = truncate(verdict || summary || title, 300);

  const head = [
    `<title>${esc(title)} — ${esc(t("siteName", lang))}</title>`,
    `<meta name="description" content="${esc(metaDescription)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<link rel="alternate" hreflang="de" href="${esc(deUrl)}" />`,
    `<link rel="alternate" hreflang="en" href="${esc(enUrl)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(deUrl)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${esc(t("siteName", lang))}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(metaDescription)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:locale" content="${lang === "de" ? "de_DE" : "en_US"}" />`,
    `<meta property="og:locale:alternate" content="${lang === "de" ? "en_US" : "de_DE"}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(metaDescription)}" />`,
    image ? `<meta name="twitter:image" content="${esc(image)}" />` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // ---- JSON-LD -------------------------------------------------------
  const mentions = relations.map((r) => ({
    "@type": schemaType(r.other_type),
    name: r.other_title,
    url: itemUrl(origin, r.other_id, lang),
  }));

  const sameAs = [externalHref, sourceUrl].filter(Boolean);

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType(item.type),
    "@id": canonical,
    name: title,
    url: canonical,
    inLanguage: lang,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  };
  if (summary) ld.description = summary;
  if (image) ld.image = image;
  if (sameAs.length) ld.sameAs = sameAs;
  if (tags.length) ld.keywords = tags.join(", ");
  if (mentions.length) ld.mentions = mentions;
  if (verdict) ld.abstract = verdict;
  if (item.startYear != null) ld.temporalCoverage = item.endYear != null ? `${item.startYear}/${item.endYear}` : `${item.startYear}`;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("siteName", lang), item: origin + "/" },
      { "@type": "ListItem", position: 2, name: t("index", lang), item: origin + "/library" },
      { "@type": "ListItem", position: 3, name: title, item: canonical },
    ],
  };

  const jsonLd =
    `<script type="application/ld+json">${jsonLdSafe(ld)}</script>\n` +
    `<script type="application/ld+json">${jsonLdSafe(breadcrumb)}</script>`;

  // ---- Body ----------------------------------------------------------
  const parts: string[] = [];

  parts.push(`<article>`);
  parts.push(`<div class="item-kicker">${esc(item.type)}</div>`);
  parts.push(`<h1>${esc(title)}</h1>`);

  if (image) {
    parts.push(
      `<figure class="item-figure"><img src="${esc(image)}" alt="${esc(title)}" loading="lazy" /></figure>`
    );
  }

  if (summary) {
    parts.push(`<section><p>${esc(summary)}</p></section>`);
  }

  if (verdict) {
    parts.push(
      `<section><h2>${esc(t("verdict", lang))}</h2>` +
        `<p class="item-verdict">${esc(verdict)}</p></section>`
    );
  }

  if (reality) {
    const checked = realityChecked
      ? ` <span class="item-meta">(${esc(t("checked", lang))} ${esc(realityChecked)})</span>`
      : "";
    parts.push(
      `<section><h2>${esc(t("reality", lang))}</h2>` +
        `<p><strong>${esc(reality)}</strong>${checked}</p></section>`
    );
  }

  if (sourceUrl || externalHref) {
    const links: string[] = [];
    if (sourceUrl) {
      links.push(
        `<li><a href="${esc(sourceUrl)}" rel="nofollow noopener">${esc(t("source", lang))}: ${esc(sourceUrl)}</a></li>`
      );
    }
    if (externalHref && externalHref !== sourceUrl) {
      links.push(
        `<li><a href="${esc(externalHref)}" rel="nofollow noopener">${esc(t("externalLink", lang))}: ${esc(externalHref)}</a></li>`
      );
    }
    parts.push(
      `<section><h2>${esc(t("source", lang))}</h2><ul class="item-meta">${links.join("")}</ul></section>`
    );
  }

  // Wirkungslinien: echte Links auf die jeweils anderen Einträge.
  parts.push(`<section><h2>${esc(t("relations", lang))}</h2>`);
  if (!relations.length) {
    parts.push(`<p class="item-meta">${esc(t("noRelations", lang))}</p>`);
  } else {
    parts.push(`<ul class="item-relations">`);
    for (const r of relations) {
      const label = relationLabel(r.kind, r.direction, lang);
      const href = itemPath(r.other_id, lang);
      const note = (r.note || "").trim();
      const src = (r.source_url || "").trim();
      const checked = (r.source_checked || "").trim();

      let li = `<li><span class="rel-kind">${esc(label)}</span>`;
      li += `<a href="${esc(href)}">${esc(r.other_title)}</a>`;
      li += ` <span class="item-meta">(${esc(r.other_type)})</span>`;
      if (note) li += `<span class="rel-note">${esc(note)}</span>`;
      if (src) {
        li += `<span class="rel-note"><a href="${esc(src)}" rel="nofollow noopener">${esc(t("source", lang))}</a>`;
        if (checked) li += ` — ${esc(t("checked", lang))} ${esc(checked)}`;
        li += `</span>`;
      }
      li += `</li>`;
      parts.push(li);
    }
    parts.push(`</ul>`);
  }
  parts.push(`</section>`);

  if (tags.length) {
    parts.push(`<section><p class="item-tags">${esc(tags.join(" · "))}</p></section>`);
  }

  const otherLang: Lang = lang === "de" ? "en" : "de";
  parts.push(
    `<section><p class="item-meta">` +
      `<a href="/library">${esc(t("backToIndex", lang))}</a>` +
      ` · <a href="${esc(itemPath(item.id, otherLang))}" hreflang="${otherLang}">${otherLang.toUpperCase()}</a>` +
      `</p></section>`
  );
  parts.push(`</article>`);

  return layout({ lang, head: head + "\n" + jsonLd, body: parts.join("\n") });
}

// -----------------------------------------------------------------------
// 404 für /item/<unbekannt>
// -----------------------------------------------------------------------
export function renderItemNotFound(lang: Lang): string {
  const head =
    `<title>${esc(t("notFoundTitle", lang))} — ${esc(t("siteName", lang))}</title>\n` +
    `<meta name="robots" content="noindex" />`;
  const body =
    `<article><h1>${esc(t("notFoundTitle", lang))}</h1>` +
    `<p>${esc(t("notFoundText", lang))}</p>` +
    `<p><a href="/library">${esc(t("backToIndex", lang))}</a></p></article>`;
  return layout({ lang, head, body });
}

// -----------------------------------------------------------------------
// sitemap.xml — jede Eintragsadresse in beiden Sprachen
// -----------------------------------------------------------------------
export function renderSitemap(
  rows: Array<{ id: string; createdAt: string | null }>,
  origin: string
): string {
  const staticPaths = ["/", "/library", "/pages/about.html"];

  const urls: string[] = [];

  for (const p of staticPaths) {
    urls.push(`  <url>\n    <loc>${esc(origin + p)}</loc>\n  </url>`);
  }

  for (const row of rows) {
    const de = itemUrl(origin, row.id, "de");
    const en = itemUrl(origin, row.id, "en");
    const lastmod = (row.createdAt || "").trim();
    const lastmodTag = /^\d{4}-\d{2}-\d{2}/.test(lastmod)
      ? `\n    <lastmod>${esc(lastmod.slice(0, 10))}</lastmod>`
      : "";

    urls.push(
      `  <url>\n    <loc>${esc(de)}</loc>${lastmodTag}\n` +
        `    <xhtml:link rel="alternate" hreflang="de" href="${esc(de)}" />\n` +
        `    <xhtml:link rel="alternate" hreflang="en" href="${esc(en)}" />\n` +
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(de)}" />\n  </url>`
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
}

// -----------------------------------------------------------------------
// robots.txt
// -----------------------------------------------------------------------
export function renderRobots(origin: string): string {
  return (
    `User-agent: *\n` +
    `Allow: /\n` +
    `Disallow: /admin\n` +
    `Disallow: /admin.html\n` +
    `\n` +
    `Sitemap: ${origin}/sitemap.xml\n`
  );
}
