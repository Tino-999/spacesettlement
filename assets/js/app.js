// assets/js/app.js
// Loads items from Cloudflare Worker /items (D1) and renders cards.
// Search + type filter (chips)

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const WORKER_BASE = (() => {
  // Optional: allow ?api=... on library page too (handy for debugging)
  const p = new URLSearchParams(location.search);
  const api = (p.get("api") || "").trim();
  // If you don't want this, just return your fixed worker URL here.
  return (api || window.SPACESETTLEMENT_API || "").replace(/\/+$/, "");
})();

const DEFAULT_ITEMS_URL = WORKER_BASE ? `${WORKER_BASE}/items` : "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev/items";
const ITEMS_URL = DEFAULT_ITEMS_URL;

const state = {
  items: [],
  q: "",
  filter: "all",
};

function normalizeText(s) {
  return String(s ?? "").toLowerCase().trim();
}

function safeJsonParse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

// Worker returns tags as JSON string sometimes; normalize here.
function normalizeItem(raw) {
  const it = { ...(raw || {}) };

  // tags can be JSON string or array
  if (typeof it.tags === "string") {
    it.tags = safeJsonParse(it.tags, []);
  }
  if (!Array.isArray(it.tags)) it.tags = [];

  // meta can be JSON string or object
  if (typeof it.meta === "string") {
    it.meta = safeJsonParse(it.meta, null);
  }
  if (it.meta && typeof it.meta !== "object") it.meta = null;

  // type safety
  it.type = String(it.type || "").trim().toLowerCase();

  return it;
}

function formatYear(y) {
  const n = Number(y);
  return Number.isFinite(n) ? String(n) : "";
}

function pickSortYear(item) {
  // Prefer meaningful year fields, fallback to worker's sortYear if present.
  if (typeof item.sortYear === "number") return item.sortYear;
  const m = item.meta || {};
  return (
    m.publishedYear ??
    m.firstPublishYear ??
    m.releasedYear ??
    m.foundedYear ??
    m.startYear ??
    m.birthYear ??
    null
  );
}

function getCardKicker(item) {
  return String(item.type || "").toUpperCase();
}

function getCardTitle(item) {
  return item.title || "(untitled)";
}

function getCardSummary(item) {
  return item.summary || "";
}

function getCardHref(item) {
  // for books, prefer wikipediaUrl if present
  if (item.type === "book" && item.meta?.wikipediaUrl) return item.meta.wikipediaUrl;
  return item.href || "";
}

function getCardImageUrl(item) {
  return item.imageUrl || "";
}

function getChipLabel(filterKey) {
  const map = {
    all: "ALL",
    people: "PEOPLE",
    projects: "PROJECTS",
    concepts: "CONCEPTS",
    orgs: "ORGS",
    topics: "TOPICS",
    books: "BOOKS",
    movies: "MOVIES",
  };
  return map[filterKey] || String(filterKey).toUpperCase();
}

function renderChips() {
  const chips = $$(".chip[data-filter]");
  chips.forEach((chip) => {
    const f = chip.getAttribute("data-filter");
    chip.classList.toggle("is-active", f === state.filter);
    chip.textContent = getChipLabel(f);
  });
}

// ✅ FIX: UI filter values are plural (books/people/...), item.type is singular (book/person/...).
function passesFilter(item, q, filter) {
  const typeRaw = String(item?.type || "").trim().toLowerCase();

  // item.type is stored as singular (book/person/...), UI filters are plural (books/people/...)
  const TYPE_TO_FILTER = {
    person: "people",
    people: "people",
    project: "projects",
    projects: "projects",
    concept: "concepts",
    concepts: "concepts",
    org: "orgs",
    orgs: "orgs",
    topic: "topics",
    topics: "topics",
    book: "books",
    books: "books",
    movie: "movies",
    movies: "movies",
  };

  const typeFilter = TYPE_TO_FILTER[typeRaw] || typeRaw;

  if (filter && filter !== "all" && typeFilter !== filter) return false;

  const query = normalizeText(q);
  if (!query) return true;

  const tags = Array.isArray(item.tags) ? item.tags : [];

  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  const metaParts = meta ? Object.values(meta).flat().map(String) : [];

  const hay = [
    item.title,
    item.summary,
    item.href,
    ...tags,
    ...metaParts,
  ].map((s) => normalizeText(s)).join(" ");

  return hay.includes(query);
}

function renderNoResults(container) {
  container.innerHTML = `
    <div class="noResults">
      <div class="noResults__kicker">NO RESULTS</div>
      <div class="noResults__text">Nothing matched your filter/search.</div>
    </div>
  `;
}

function renderCards(items) {
  const host = $("#cards");
  if (!host) return;

  host.innerHTML = "";

  if (!items.length) {
    renderNoResults(host);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";

    const imgUrl = getCardImageUrl(item);
    const href = getCardHref(item);

    const year = pickSortYear(item);
    const kicker = getCardKicker(item);
    const title = getCardTitle(item);
    const summary = getCardSummary(item);
    const tags = Array.isArray(item.tags) ? item.tags : [];

    card.innerHTML = `
      <div class="card__row">
        <div class="card__media">
          ${
            imgUrl
              ? `<img class="card__img" src="${imgUrl}" alt="">`
              : `<div class="card__img card__img--empty"></div>`
          }
        </div>
        <div class="card__content">
          <div class="card__meta">
            <span class="card__kicker">${kicker}</span>
            ${year ? `<span class="card__year">${formatYear(year)}</span>` : ""}
          </div>

          <h3 class="card__title">
            ${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}
          </h3>

          ${summary ? `<p class="card__summary">${summary}</p>` : ""}

          ${
            tags.length
              ? `<div class="tags">${tags
                  .slice(0, 12)
                  .map((t) => `<span class="tag">${t}</span>`)
                  .join("")}</div>`
              : ""
          }
        </div>
      </div>
    `;

    host.appendChild(card);
  });
}

function applyAndRender() {
  renderChips();

  const filtered = state.items
    .filter((it) => passesFilter(it, state.q, state.filter))
    .sort((a, b) => {
      const ya = pickSortYear(a) ?? -999999;
      const yb = pickSortYear(b) ?? -999999;
      if (ya !== yb) return yb - ya;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });

  renderCards(filtered);
}

async function loadItems() {
  const status = $("#status");
  if (status) status.textContent = `Loading…`;

  let res;
  try {
    res = await fetch(ITEMS_URL);
  } catch (e) {
    if (status) status.textContent = `Failed to fetch: ${e?.message || e}`;
    return;
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (status) status.textContent = `Bad JSON from API`;
    return;
  }

  const items = Array.isArray(data?.items) ? data.items.map(normalizeItem) : [];

  state.items = items;

  if (status) status.textContent = `${items.length} items`;
  applyAndRender();
}

function wireUi() {
  // search
  const search = $("#search");
  if (search) {
    search.addEventListener("input", () => {
      state.q = search.value || "";
      applyAndRender();
    });
  }

  // filter chips
  $$(".chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filter = chip.getAttribute("data-filter") || "all";
      applyAndRender();
    });
  });
}

wireUi();
loadItems();
