// assets/js/app.js

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const WORKER_BASE = (() => {
  const p = new URLSearchParams(location.search);
  const api = (p.get("api") || "").trim();
  return (api || window.SPACESETTLEMENT_API || "").replace(/\/+$/, "");
})();

const ITEMS_URL = WORKER_BASE
  ? `${WORKER_BASE}/items`
  : "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev/items";

const state = {
  items: [],
  q: "",
  filter: "all",
};

function normalizeText(s) {
  return String(s ?? "").toLowerCase().trim();
}

/* =========================
   🔧 MINIMAL FIX START
   ========================= */
function normalizeTypeForFilter(type) {
  const t = String(type || "").toLowerCase();
  if (t === "person") return "people";
  if (t === "project") return "projects";
  if (t === "concept") return "concepts";
  if (t === "org") return "orgs";
  if (t === "topic") return "topics";
  if (t === "book") return "books";
  if (t === "movie") return "movies";
  return t;
}
/* =========================
   🔧 MINIMAL FIX END
   ========================= */

function safeJsonParse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function normalizeItem(raw) {
  const it = { ...(raw || {}) };

  if (typeof it.tags === "string") it.tags = safeJsonParse(it.tags, []);
  if (!Array.isArray(it.tags)) it.tags = [];

  if (typeof it.meta === "string") it.meta = safeJsonParse(it.meta, null);
  if (it.meta && typeof it.meta !== "object") it.meta = null;

  it.type = String(it.type || "").trim().toLowerCase();
  return it;
}

function pickSortYear(item) {
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

function passesFilter(item, q, filter) {
  const type = String(item.type ?? "").toLowerCase();

  // ✅ ONLY LINE THAT CHANGED (logic only)
  if (filter !== "all" && normalizeTypeForFilter(type) !== filter) return false;

  if (!q) return true;

  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;
  const hay = [
    item.title,
    item.summary,
    item.href,
    ...(Array.isArray(item.tags) ? item.tags : []),
    meta ? JSON.stringify(meta) : "",
  ]
    .map(normalizeText)
    .join(" ");

  return hay.includes(q);
}

function renderChips() {
  $$(".chip[data-filter]").forEach((chip) => {
    const f = chip.getAttribute("data-filter");
    chip.classList.toggle("is-active", f === state.filter);
  });
}

function renderCards(items) {
  const host = $("#cards");
  if (!host) return;

  host.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";

    const imgUrl = item.imageUrl || "";
    const href =
      item.type === "book" && item.meta?.wikipediaUrl
        ? item.meta.wikipediaUrl
        : item.href || "";

    const year = pickSortYear(item);

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
            <span class="card__kicker">${item.type.toUpperCase()}</span>
            ${year ? `<span class="card__year">${year}</span>` : ""}
          </div>
          <h3 class="card__title">
            ${
              href
                ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${item.title}</a>`
                : item.title
            }
          </h3>
          ${item.summary ? `<p class="card__summary">${item.summary}</p>` : ""}
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
  const res = await fetch(ITEMS_URL);
  const data = await res.json();
  state.items = Array.isArray(data?.items)
    ? data.items.map(normalizeItem)
    : [];
  applyAndRender();
}

function wireUi() {
  const search = $("#search");
  if (search) {
    search.addEventListener("input", () => {
      state.q = search.value || "";
      applyAndRender();
    });
  }

  $$(".chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filter = chip.getAttribute("data-filter") || "all";
      applyAndRender();
    });
  });
}

wireUi();
loadItems();
