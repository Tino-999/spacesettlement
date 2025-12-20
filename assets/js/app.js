// assets/js/app.js
// Loads items either from Netlify Blobs API (recommended) or from static data/items.json (fallback).
// Provides simple search + type filter and renders cards into #cards.

const NETLIFY_ORIGIN = "https://inquisitive-sunshine-0cfe6a.netlify.app";

const IS_NETLIFY = location.hostname.endsWith("netlify.app");

// On Netlify, same-origin functions work. Else (GitHub Pages), fallback to static JSON.
// Note: You *can* call Netlify cross-origin, but for now we keep GH Pages as a static demo.
const ITEMS_URL = IS_NETLIFY
  ? "/.netlify/functions/items"
  : "data/items.json";

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

function resolveImagePath(item) {
  const img = String(item?.image ?? "").trim();
  if (!img) return "";

  // Already a path like "assets/img/cards/people/x.jpg"
  if (img.includes("/")) return img;

  // If only a filename like "elon_musk.jpg"
  const type = String(item?.type ?? "").trim().toLowerCase();

  if (type === "person") return `assets/img/cards/people/${img}`;

  // Generic fallback for non-person types
  return `assets/img/cards/${img}`;
}

async function loadItems() {
  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const data = await res.json();

  // Netlify function returns { ok:true, items:[...] }
  if (data && typeof data === "object" && Array.isArray(data.items)) {
    return data.items;
  }

  // Static file returns [...]
  if (Array.isArray(data)) {
    return data;
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

  const hay = [
    item.title,
    item.summary,
    item.href,
    ...(Array.isArray(item.tags) ? item.tags : []),
    item.type,
  ].map(normalizeText).join(" ");

  return hay.includes(q);
}

function render(items) {
  if (!els.cards) return;

  if (!items.length) {
    els.cards.innerHTML = `<div class="card"><div class="card__row" style="grid-template-columns:1fr"><div class="card__content"><div class="card__kicker">No results</div><p class="page__lead">Nothing matched your filter/search.</p></div></div></div>`;
    return;
  }

  els.cards.innerHTML = items.map((item) => {
    const title = escapeHtml(item.title || "");
    const href = escapeHtml(item.href || "");
    const summary = escapeHtml(item.summary || "");
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const imagePath = escapeHtml(resolveImagePath(item));
    const type = escapeHtml(item.type || "");

    // If href is "kein Wiki" (from your autofill rules), don't make it a link.
    const hasLink = href && href !== "kein Wiki";

    return `
      <article class="card">
        <div class="card__row" style="grid-template-columns:160px 1fr">
          <div class="card__media" style="display:flex; align-items:center; justify-content:center;">
            ${imagePath
              ? `<img src="${imagePath}" alt="${title}" style="width:140px; height:140px; object-fit:cover; border-radius:16px; opacity:0.9;" loading="lazy">`
              : `<div style="width:140px; height:140px; border-radius:16px; background:rgba(255,255,255,0.06);"></div>`
            }
          </div>
          <div class="card__content">
            <div class="card__kicker">${type}</div>
            <h2 style="margin:0 0 6px 0; font-size:22px; letter-spacing:0.02em;">
              ${
                hasLink
                  ? `<a href="${href}" target="_blank" rel="noopener" class="nav__link" style="padding:0; border:none;">${title}</a>`
                  : `${title}`
              }
            </h2>
            ${summary ? `<p class="page__lead" style="margin:0 0 10px 0; font-size:14px;">${summary}</p>` : ""}
            ${
              tags.length
                ? `<div class="chips" role="list" aria-label="tags">
                    ${tags.map((t) => `<span class="chip" role="listitem" style="cursor:default;">${escapeHtml(t)}</span>`).join("")}
                   </div>`
                : ``
            }
          </div>
        </div>
      </article>
    `;
  }).join("");
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
      els.cards.innerHTML = `<div class="card"><div class="card__row" style="grid-template-columns:1fr"><div class="card__content"><div class="card__kicker">Error</div><pre class="code" style="white-space:pre-wrap;">${escapeHtml(e?.message || e)}</pre></div></div></div>`;
    }
    return;
  }

  // Default sort: title asc (stable, nice for browsing)
  allItems.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

  // Wire chips
  els.chips.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveChip(btn.dataset.filter || "all");
      applyAndRender();
    });
  });

  // Wire search
  els.q?.addEventListener("input", () => applyAndRender());

  // Initial render
  setActiveChip("all");
  applyAndRender();
}

init();
