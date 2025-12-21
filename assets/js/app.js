// assets/js/app.js
// Loads items from Cloudflare Worker API (/items) backed by D1.
// Provides simple search + type filter and renders cards into #cards.

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

function resolveImagePath(item) {
  // Prefer remote imageUrl (new model)
  const imageUrl = String(item?.imageUrl ?? "").trim();
  if (imageUrl) return imageUrl;

  // Backward-compatible fallback: local "image" filename or already-full URL/path
  const img = String(item?.image ?? "").trim();
  if (!img) return "";

  // If already a full/relative path or URL, don't touch it
  if (isLikelyUrlOrPath(img)) return img;

  const type = String(item?.type ?? "").trim().toLowerCase();

  // Map item.type -> folder name under assets/img/cards/
  const folderByType = {
    person: "people",
    project: "projects",
    concept: "concepts",
    org: "orgs",
    topic: "topics",
    book: "books",
    movie: "movies",
  };

  const folder = folderByType[type];

  // If we know the folder, use it. Otherwise fall back to assets/img/cards/<filename>
  return folder ? `assets/img/cards/${folder}/${img}` : `assets/img/cards/${img}`;
}

async function loadItems() {
  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const data = await res.json();

  // Worker returns { ok:true, items:[...] }
  if (data && typeof data === "object" && Array.isArray(data.items)) {
    return data.items;
  }

  // If you ever use a raw array response
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
  ]
    .map(normalizeText)
    .join(" ");

  return hay.includes(q);
}

function formatPersonTitle(title, birthYear, deathYear) {
  if (birthYear == null && deathYear == null) {
    return title;
  }

  let yearStr = "";
  if (birthYear != null) {
    yearStr = String(birthYear);
  }

  if (deathYear != null) {
    yearStr += "-" + String(deathYear);
  } else if (birthYear != null) {
    yearStr += "-";
  }

  return yearStr ? `${title} (${yearStr})` : title;
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
      const type = escapeHtml(item.type || "");

      // For persons, add birth/death years to title
      if (type === "person") {
        const birthYear =
          item.birthYear != null ? parseInt(item.birthYear, 10) : null;
        const deathYear =
          item.deathYear != null ? parseInt(item.deathYear, 10) : null;
        title = escapeHtml(formatPersonTitle(item.title || "", birthYear, deathYear));
      }

      // If href is "kein Wiki" (from your autofill rules), don't make it a link.
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
              <!-- Fade is INSIDE media so it never dims the text -->
              <div class="card__fade" aria-hidden="true"></div>
            </div>

            <div class="card__content">
              <div class="card__kicker">${type}</div>

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

  // Sort: persons by birthYear (ascending), others by title
  allItems.sort((a, b) => {
    if (a.type === "person" && b.type === "person") {
      const aYear = a.birthYear != null ? parseInt(a.birthYear, 10) : null;
      const bYear = b.birthYear != null ? parseInt(b.birthYear, 10) : null;

      if (aYear != null && bYear != null) return aYear - bYear;
      if (aYear != null) return -1;
      if (bYear != null) return 1;
    }

    return String(a.title || "").localeCompare(String(b.title || ""));
  });

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
