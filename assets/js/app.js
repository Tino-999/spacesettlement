// assets/js/app.js
// Loads items from Cloudflare Worker /items (D1) and renders cards.
// Search + type filter (chips).
// Sorts by sortYear (DESC), fallback title (ASC).

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

/* ---------------- helpers ---------------- */

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

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(String).map((x) => x.trim()).filter(Boolean);

  if (typeof tags === "string") {
    const t = tags.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(String).map((x) => x.trim()).filter(Boolean);
    } catch {}
    return t.split(",").map((x) => x.trim()).filter(Boolean);
  }

  return [];
}

function normalizeItem(raw) {
  const it = { ...(raw || {}) };

  it.tags = normalizeTags(it.tags);
  it.imageUrl = typeof it.imageUrl === "string" ? it.imageUrl.trim() : "";
  it.image = typeof it.image === "string" ? it.image.trim() : "";
  it.meta = safeJsonParse(it.meta);

  if (typeof it.sortYear === "string") {
    const n = parseInt(it.sortYear, 10);
    it.sortYear = Number.isFinite(n) ? n : null;
  } else if (typeof it.sortYear !== "number") {
    it.sortYear = null;
  }

  return it;
}

function resolveImagePath(item) {
  const imageUrl = String(item?.imageUrl ?? "").trim();
  if (imageUrl) return imageUrl;

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

/* ---------------- data ---------------- */

async function loadItems() {
  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const data = await res.json();

  if (data && typeof data === "object" && Array.isArray(data.items)) {
    return data.items.map(normalizeItem);
  }
  return [];
}

/* ---------------- filter/sort ---------------- */

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
    <div class="card__media">
      ${
        imagePath
          ? `<img class="card__img" src="${imagePath}" alt="${title}" loading="lazy">`
          : ``
      }
      <div class="card__fade" aria-hidden="true"></div>
    </div>
  `;
}

// Book: unified gradient across cover + dust so there is no seam.
// Also hides broken images and keeps the cover area stable.
function renderMediaBook(imagePath, title) {
  const hasImg = Boolean(String(imagePath || "").trim());

  return `
    <div class="card__media" style="
      position:relative;
      display:flex;
      gap:18px;
      align-items:stretch;
      overflow:hidden;
      border-radius:16px;
      background:
        radial-gradient(140% 120% at 18% 35%, rgba(255,255,255,0.12), rgba(0,0,0,0.92));
    ">

      <!-- unified soft grey → black fade (THIS is the place you tweak in DevTools) -->
      <div aria-hidden="true" style="
        position:absolute;
        inset:0;
        background:
          radial-gradient(140% 110% at 18% 38%, rgba(255,255,255,0.12), transparent 58%),
          linear-gradient(
            90deg,
            rgba(255,255,255,0.10) 0%,
            rgba(120,120,120,0.08) 35%,
            rgba(0,0,0,0.55) 65%,
            rgba(0,0,0,0.85) 85%,
            rgba(0,0,0,0.97) 100%
          );
        pointer-events:none;
        z-index:1;
      "></div>

      <!-- cover -->
      <div data-cover style="
        position:relative;
        z-index:2;
        flex:0 0 240px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:14px;
        border-radius:16px;
        overflow:hidden;
        background: radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,0.10), rgba(0,0,0,0.85));
      ">
        ${
          hasImg
            ? `<img
                src="${imagePath}"
                alt=""
                loading="lazy"
                onerror="this.style.display='none';"
                style="
                  width:100%;
                  height:100%;
                  object-fit:contain;
                  display:block;
                  border-radius:12px;
                  filter: grayscale(1) contrast(1.05) brightness(.92);
                "
              >`
            : ``
        }
      </div>

      <!-- dust area -->
      <div style="
        position:relative;
        z-index:2;
        flex:1;
        min-height:340px;
        overflow:hidden;
        border-radius:16px;
      ">
        <canvas
          data-dust="1"
          aria-hidden="true"
          style="position:absolute; inset:0; width:100%; height:100%; display:block;"
        ></canvas>
      </div>

      <div class="card__fade" aria-hidden="true"></div>
    </div>
  `;
}

function renderMedia(type, imagePath, title) {
  const t = String(type || "").toLowerCase();
  if (t === "book" || t === "books") return renderMediaBook(imagePath, title);
  return renderMediaDefault(imagePath, title);
}

/* ---------------- render ---------------- */

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
      const type = String(item.type || "").toLowerCase();
      const title = escapeHtml(item.title || "");
      const href = escapeHtml(item.href || "");
      const summary = escapeHtml(item.summary || "");
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const imagePath = escapeHtml(resolveImagePath(item));
      const hasLink = href && href !== "kein Wiki";

      return `
        <article class="card">
          <div class="card__row">
            ${renderMedia(type, imagePath, title)}

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

  requestAnimationFrame(initDustCanvases);
}

/* ---------------- dust ---------------- */

const dustMap = new WeakMap();

function initDustCanvases() {
  document.querySelectorAll("canvas[data-dust]").forEach((canvas) => {
    if (dustMap.has(canvas)) return;
    dustMap.set(canvas, createDust(canvas));
  });
}

function createDust(canvas) {
  const ctx = canvas.getContext("2d", { alpha: true });

  let cssW = 1;
  let cssH = 1;
  let parts = [];

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    cssW = Math.max(1, Math.floor(r.width));
    cssH = Math.max(1, Math.floor(r.height));

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.floor(Math.min(900, Math.max(260, (cssW * cssH) / 2600)));
    parts = Array.from({ length: count }, () => ({
      x: Math.random() * cssW,
      y: Math.random() * cssH,
      vx: 0,
      vy: 0,
    }));

    ctx.clearRect(0, 0, cssW, cssH);
  }

  function step() {
    // Trail (increase last value for faster fade: 0.10 .. 0.14)
    ctx.fillStyle = "rgba(0,0,0,0.09)";
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.globalCompositeOperation = "lighter";

    for (const p of parts) {
      const ox = p.x;
      const oy = p.y;

      p.vx += (Math.random() - 0.5) * 0.02;
      p.vy += (Math.random() - 0.5) * 0.02;

      p.vx *= 0.96;
      p.vy *= 0.96;

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -20 || p.y < -20 || p.x > cssW + 20 || p.y > cssH + 20) {
        p.x = Math.random() * cssW;
        p.y = Math.random() * cssH;
        p.vx = 0;
        p.vy = 0;
        continue;
      }

      // Line visibility (lower alpha = subtler)
      ctx.strokeStyle = "rgba(220,220,220,0.08)";
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(step);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  resize();
  requestAnimationFrame(step);

  return {
    destroy() {
      try { ro.disconnect(); } catch {}
    },
  };
}

/* ---------------- init ---------------- */

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
              <pre class="code" style="white-space:pre-wrap;">${escapeHtml(e?.message || e)}</pre>
            </div>
          </div>
        </div>
      `;
    }
    return;
  }

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
