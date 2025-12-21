// assets/js/app.js
// Loads items from Cloudflare Worker API and renders cards.

const API_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";

const ITEMS_URL = `${API_BASE}/items`;

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

function resolveImageUrl(item) {
  const url = String(item?.imageUrl ?? "").trim();
  return url || "";
}

async function loadItems() {
  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const data = await res.json();

  if (data && Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

function setActiveChip(filter) {
  activeFilter = filter;
  els.chips.forEach((b) =>
    b.classList.toggle("is-active", b.dataset.filter === filter)
  );
}

function passesFilter(item, q, filter) {
  const type = String(item.type ?? "").toLowerCase();

  if (filter !== "all" && type !== filter) return false;
  if (!q) return true;

  const hay = [
    item.title,
    item.summary,
    item.href,
    ...(item.tags || []),
    item.type,
  ]
    .map(normalizeText)
    .join(" ");

  return hay.includes(q);
}

function formatPersonTitle(title, birthYear, deathYear) {
  if (!birthYear && !deathYear) return title;

  let years = birthYear ? String(birthYear) : "";
  years += deathYear ? `-${deathYear}` : birthYear ? "-" : "";

  return `${title} (${years})`;
}

function render(items) {
  if (!els.cards) return;

  if (!items.length) {
    els.cards.innerHTML = `
      <div class="card">
        <div class="card__content">
          <div class="card__kicker">No results</div>
        </div>
      </div>`;
    return;
  }

  els.cards.innerHTML = items
    .map((item) => {
      let title = escapeHtml(item.title || "");
      const href = escapeHtml(item.href || "");
      const summary = escapeHtml(item.summary || "");
      const tags = item.tags || [];
      const imageUrl = escapeHtml(resolveImageUrl(item));
      const type = escapeHtml(item.type || "");

      if (type === "person") {
        title = escapeHtml(
          formatPersonTitle(item.title, item.birthYear, item.deathYear)
        );
      }

      const hasLink = href && href !== "kein Wiki";

      return `
        <article class="card">
          <div class="card__row">
            <div class="card__media">
              ${
                imageUrl
                  ? `<img class="card__img" src="${imageUrl}" alt="${title}" loading="lazy">`
                  : ""
              }
              <div class="card__fade"></div>
            </div>

            <div class="card__content">
              <div class="card__kicker">${type}</div>

              <h2 class="card__title">
                ${
                  hasLink
                    ? `<a href="${href}" target="_blank" rel="noopener">${title}</a>`
                    : title
                }
              </h2>

              ${summary ? `<p class="card__summary">${summary}</p>` : ""}

              ${
                tags.length
                  ? `<div class="card__meta">
                      ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
                     </div>`
                  : ""
              }
            </div>
          </div>
        </article>`;
    })
    .join("");
}

function applyAndRender() {
  const q = normalizeText(els.q?.value || "");
  render(allItems.filter((it) => passesFilter(it, q, activeFilter)));
}

async function init() {
  if (els.year) els.year.textContent = String(new Date().getFullYear());

  allItems = await loadItems();

  allItems.sort((a, b) => {
    if (a.type === "person" && b.type === "person") {
      return (a.birthYear || 9999) - (b.birthYear || 9999);
    }
    return String(a.title).localeCompare(String(b.title));
  });

  els.chips.forEach((btn) =>
    btn.addEventListener("click", () => {
      setActiveChip(btn.dataset.filter);
      applyAndRender();
    })
  );

  els.q?.addEventListener("input", applyAndRender);

  setActiveChip("all");
  applyAndRender();
}

init();
