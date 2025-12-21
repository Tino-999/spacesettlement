// assets/js/app.js
// Loads items from Cloudflare Worker /items (D1) and renders cards.
// Provides search + type filter.
// Sorts globally by sortYear (DESC), fallback by title (ASC).

const WORKER_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";

const ITEMS_URL = `${WORKER_BASE}/items`;

const els = {
  q: document.getElementById("q"),
  cards: document.getElementById("cards"),
  year: document.getElementById("year"),
  chips: Array.from(document.querySelectorAll(".chip[data-filter]")),
};

let allItems = [];
let activeFilter = "all";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}

function isLikelyUrlOrPath(s) {
  const v = String(s || "").trim();
  if (!v) return false;
  return v.includes("/") || v.startsWith("http://") || v.startsWith("https://");
}

function normalizeTags(tags) {
  // D1 often stores tags as JSON string -> convert to array
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);

  if (typeof tags === "string") {
    const t = tags.trim();
    if (!t) return [];
    // Try JSON parse first
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    // Fallback: comma-separated
    return t
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function safeJsonParse(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeItem(raw) {
  const it = { ...(raw || {}) };

  // Normalize tags
  it.tags = normalizeTags(it.tags);

  // Normalize imageUrl field (some rows may have null)
  it.imageUrl = typeof it.imageUrl === "string" ? it.imageUrl.trim() : "";

  // Normalize legacy image
  it.image = typeof it.image === "string" ? it.image.trim() : "";

  // Normalize meta (worker returns object; older rows may have null/string)
  it.meta = safeJsonParse(it.meta);

  // Normalize sortYear
  if (typeof it.sortYear === "string") {
    const n = parseInt(it.sortYear, 10);
    it.sortYear = Number.isFinite(n) ? n : null;
  } else if (typeof it.sortYear !== "number") {
    it.sortYear = null;
  }

  return it;
}

function resolveImagePath(item) {
  // Prefer remote imageUrl (new model)
  const imageUrl = String(item?.imageUrl ?? "").trim();
  if (imageUrl) return imageUrl;

  // Backward-compatible fallback: local "image" filename or already-full URL/path
  const img = String(item?.image ?? "").trim();
  if (!img) return "";

  if (isLikelyUrlOrPath(img)) return img;

  const type = String(item?.type ?? "").trim().toLowerCase();

  const folderByType = {
    people: "people",
    projects: "projects",
    concepts: "concepts",
    orgs: "orgs",
    topics: "topics",
    books: "books",
    movies: "movies",

    // legacy support
    person: "people",
    project: "projects",
    concept: "concepts",
    org: "orgs",
    topic: "topics",
    book: "books",
    movie: "movies",
  };

  const folder = folderByType[type];
  return folder ? `assets/img/cards/${folder}/${img}` : `assets/img/cards/${img}`;
}

async function loadItems() {
  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const data = await res.json();

  if (data && typeof data === "object" && Array.isArray(data.items)) {
    return data.items.map(normalizeItem);
  }

  return [];
}

function setActiveChip(filter) {
  activeFilter = filter;
  els.chips.forEach((b) => {
    const isActive = b.dataset.filter === filter;
    b.classList.toggle("is-active", isActive);
  });
}

function passesFilter(item, q, filter) {
  const type = String(item.type ?? "").toLowerCase();

  if (filter !== "all" && type !== filter) return false;
  if (!q) return true;

  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;

  const hay = [
    item.title,
    item.summary,
    item.href,
    ...(Array.isArray(item.tags) ? item.tags : []),
    item.type,

    // include meta values for search (strings + numbers + arrays)
    meta ? JSON.stringify(meta) : "",
  ]
    .map(normalizeText)
    .join(" ");

  return hay.includes(q);
}

function formatPersonTitle(title, birthYear, deathYear) {
  if (birthYear == null && deathYear == null) return title;

  let yearStr = "";
  if (birthYear != null) yearStr = String(birthYear);

  if (deathYear != null) yearStr += "-" + String(deathYear);
  else if (birthYear != null) yearStr += "-";

  return yearStr ? `${title} (${yearStr})` : title;
}

function getPeopleYears(item) {
  // Prefer meta, fallback to legacy columns
  const meta = item?.meta && typeof item.meta === "object" ? item.meta : null;

  const birth =
    meta?.birthYear != null
      ? parseInt(meta.birthYear, 10)
      : item.birthYear != null
      ? parseInt(item.birthYear, 10)
      : null;

  const death =
    meta?.deathYear != null
      ? parseInt(meta.deathYear, 10)
      : item.deathYear != null
      ? parseInt(item.deathYear, 10)
      : null;

  return {
    birthYear: Number.isFinite(birth) ? birth : null,
    deathYear: Number.isFinite(death) ? death : null,
  };
}

function sortItemsByYear(items) {
  return [...items].sort((a, b) => {
    const ay = typeof a.sortYear === "number" ? a.sortYear : null;
    const by = typeof b.sortYear === "number" ? b.sortYear : null;

    if (ay != null && by != null && ay !== by) {
      return by - ay; // DESC
    }
    if (ay != null && by == null) return -1;
    if (ay == null && by != null) return 1;

    const at = String(a.title || "").toLowerCase();
    const bt = String(b.title || "").toLowerCase();
    return at.localeCompare(bt);
  });
}

function render(items) {
  if (!els.cards) return;

  if (!items.length) {
    els.cards.innerHTML = `
      <div class="card">
        <div class="card__row" style="grid-template-columns:1fr">
          <div class="card__content">
            <div class="card__kicker">No results</div>
            <p class="page__lead">Nothing matched your filter/search.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  els.cards.innerHTML = items
    .map((item) => {
      let title = escapeHtml(item.title || "");
      const href = escapeHtml(item.href || "");
      const summary = escapeHtml(item.summary || "");
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const imagePath = escapeHtml(resolveImagePath(item));
      const type = String(item.type || "").toLowerCase();

      // Support new type "people" and legacy "person"
      if (type === "people" || type === "person") {
        const { birthYear, deathYear } = getPeopleYears(item);
        title = escapeHtml(formatPersonTitle(item.title || "", birthYear, deathYear));
      }

      const hasLink = href && href !== "kein Wiki";

      return `
        <article class="card">
          <div class="card__row">
            <div class="card__media">
              ${
                imagePath
                  ? `<img class="card__img" src="${imagePath}" alt="${title}" loading="lazy">`
                  : ``
              }
              <div class="card__fade" aria-hidden="true"></div>
            </div>

            <div class="card__content">
              <div class="card__kicker">${escapeHtml(type)}</div>

              <h2 class="card__title">
                ${
                  hasLink
                    ? `<a href="${href}" target="_blank" rel="noopener">${title}</a>`
                    : `${title}`
                }
              </h2>

              ${summary ? `<p class="card__summary">${summary}</p>` : ""}

              ${
                tags.length
                  ? `<div class="card__meta" aria-label="tags">
                      ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
                     </div>`
                  : ``
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function applyAndRender() {
  const q = normalizeText(els.q?.value || "");
  const filtered = allItems.filter((it) => passesFilter(it, q, activeFilter));
  render(filtered);
}

async function init() {
  if (els.year) els.year.textContent = String(new Date().getFullYear());

  try {
    allItems = await loadItems();
  } catch (e) {
    console.error(e);
    if (els.cards) {
      els.cards.innerHTML = `
        <div class="card">
          <div class="card__row" style="grid-template-columns:1fr">
            <div class="card__content">
              <div class="card__kicker">Error</div>
              <pre class="code" style="white-space:pre-wrap;">${escapeHtml(
                e?.message || e
              )}</pre>
            </div>
          </div>
        </div>
      `;
    }
    return;
  }

  // NEW: Global sort by sortYear (DESC), fallback by title (ASC)
  allItems = sortItemsByYear(allItems);

  els.chips.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveChip(btn.dataset.filter || "all");
      applyAndRender();
    });
  });

  els.q?.addEventListener("input", () => applyAndRender());

  setActiveChip("all");
  applyAndRender();
}

init();
