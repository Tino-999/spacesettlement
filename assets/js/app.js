// assets/js/app.js
// Loads items from Cloudflare Worker /items (D1) and renders cards.
// Search + type filter (chips).
// Sorts by sortYear (DESC), fallback title (ASC).
//
// Updated: Stardust is now a SINGLE global background canvas behind all tiles.
// - No per-card / per-book dust canvases anymore (prevents seams + blocks)
// - Canvas is injected automatically if not present in HTML

const WORKER_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";
const ITEMS_URL = `${WORKER_BASE}/items`;

const els = {
  q: document.getElementById("q"),
  cards: document.getElementById("cards"),
  year: document.getElementById("year"),
  chips: Array.from(document.querySelectorAll(".chip[data-filter]")),
};

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

function normalizeTypeForFilter(type) {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'person') return 'people';
  if (t === 'project') return 'projects';
  if (t === 'concept') return 'concepts';
  if (t === 'org') return 'orgs';
  if (t === 'topic') return 'topics';
  if (t === 'book') return 'books';
  if (t === 'movie') return 'movies';
  return t;
}

function isLikelyUrlOrPath(s) {
  const v = String(s || "").trim();
  if (!v) return false;
  return v.includes("/") || v.startsWith("http://") || v.startsWith("https://");
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
  const item = { ...(raw || {}) };

  // tags: JSON string -> array
  if (typeof item.tags === "string") {
    const parsed = safeJsonParse(item.tags);
    item.tags = Array.isArray(parsed) ? parsed : [];
  } else if (!Array.isArray(item.tags)) {
    item.tags = [];
  }

  // meta: JSON string -> object
  if (typeof item.meta === "string") {
    const parsed = safeJsonParse(item.meta);
    item.meta = parsed && typeof parsed === "object" ? parsed : null;
  } else if (item.meta && typeof item.meta !== "object") {
    item.meta = null;
  }

  item.type = String(item.type || "").toLowerCase();

  // sortYear may come from DB; keep as-is if number
  if (typeof item.sortYear !== "number") {
    item.sortYear = null;
  }

  return item;
}

function passesFilter(item, q, filter) {
  const type = String(item.type ?? "").toLowerCase();
  if (filter !== "all" && normalizeTypeForFilter(type) !== filter) return false;
  if (!q) return true;

  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;

  const hay = [
    item.title,
    item.summary,
    item.href,
    ...(Array.isArray(item.tags) ? item.tags : []),
    item.type,
    meta ? JSON.stringify(meta) : "",
  ]
    .map(normalizeText)
    .join(" ");

  return hay.includes(q);
}

function sortItemsByYear(items) {
  return [...items].sort((a, b) => {
    const ay = typeof a.sortYear === "number" ? a.sortYear : null;
    const by = typeof b.sortYear === "number" ? b.sortYear : null;

    if (ay != null && by != null && ay !== by) return by - ay; // DESC
    if (ay != null && by == null) return -1;
    if (ay == null && by != null) return 1;

    const at = String(a.title || "").toLowerCase();
    const bt = String(b.title || "").toLowerCase();
    return at.localeCompare(bt);
  });
}

/* ---------------- media templates ---------------- */

function renderMediaDefault(imagePath, title) {
  return `
    <div class="tile__media">
      ${
        imagePath
          ? `<img class="tile__img" src="${escapeHtml(imagePath)}" alt="${escapeHtml(title)}" loading="lazy">`
          : `<div class="tile__img tile__img--placeholder"></div>`
      }
    </div>
  `;
}

function renderTile(item) {
  const title = item.title || "";
  const summary = item.summary || "";
  const href = item.href || "";

  const imageUrl = item.imageUrl || "";
  const imagePath = imageUrl && isLikelyUrlOrPath(imageUrl) ? imageUrl : "";

  // Optional year display
  let yearText = "";
  if (typeof item.sortYear === "number") yearText = String(item.sortYear);

  return `
    <article class="tile">
      ${renderMediaDefault(imagePath, title)}
      <div class="tile__body">
        <div class="tile__meta">
          <span class="tile__type">${escapeHtml(item.type || "")}</span>
          ${yearText ? `<span class="tile__year">${escapeHtml(yearText)}</span>` : ""}
        </div>
        <h3 class="tile__title">
          ${
            href
              ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
              : escapeHtml(title)
          }
        </h3>
        ${summary ? `<p class="tile__summary">${escapeHtml(summary)}</p>` : ""}
      </div>
    </article>
  `;
}

/* ---------------- stardust global background ---------------- */

function ensureDustCanvas() {
  // Create if not present
  let canvas = document.getElementById("dust");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "dust";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
  }
  return canvas;
}

function startStardust() {
  const canvas = ensureDustCanvas();
  const ctx = canvas.getContext("2d", { alpha: true });

  let w = 0, h = 0;
  let dots = [];
  let t0 = performance.now();

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;

    // density
    const count = Math.floor((w * h) / 14000);
    dots = new Array(count).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.1 + 0.2,
      a: Math.random() * 0.45 + 0.05,
      vx: (Math.random() - 0.5) * 0.02,
      vy: (Math.random() - 0.5) * 0.02,
    }));
  }

  function tick(now) {
    const dt = Math.min(50, now - t0);
    t0 = now;

    ctx.clearRect(0, 0, w, h);

    for (const d of dots) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;

      if (d.x < -10) d.x = w + 10;
      if (d.x > w + 10) d.x = -10;
      if (d.y < -10) d.y = h + 10;
      if (d.y > h + 10) d.y = -10;

      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  requestAnimationFrame(tick);
}

/* ---------------- main ---------------- */

let ALL_ITEMS = [];

async function loadItems() {
  const res = await fetch(ITEMS_URL);
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  ALL_ITEMS = sortItemsByYear(items.map(normalizeItem));
}

function applyFilters() {
  const q = normalizeText(els.q?.value || "");
  const activeChip = els.chips.find((c) => c.classList.contains("is-active"));
  const filter = activeChip ? activeChip.getAttribute("data-filter") || "all" : "all";

  const out = ALL_ITEMS.filter((it) => passesFilter(it, q, filter));

  if (els.cards) {
    els.cards.innerHTML = out.map(renderTile).join("");
  }

  // show year hint (optional)
  if (els.year) {
    const newest = out.find((x) => typeof x.sortYear === "number");
    els.year.textContent = newest ? String(newest.sortYear) : "";
  }
}

function wireUi() {
  if (els.q) {
    els.q.addEventListener("input", () => applyFilters());
  }

  els.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      els.chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      applyFilters();
    });
  });
}

(async function main() {
  try {
    startStardust();
    await loadItems();
    wireUi();
    applyFilters();
  } catch (e) {
    console.error(e);
    if (els.cards) {
      els.cards.innerHTML = `<div class="error">Failed to load items.</div>`;
    }
  }
})();
