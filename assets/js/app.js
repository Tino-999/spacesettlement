// assets/js/app.js
// Loads items from Cloudflare Worker /items (D1) and renders cards.

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

/* ---------------- utilities ---------------- */

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

function safeJsonParse(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

function normalizeItem(raw) {
  const it = { ...(raw || {}) };
  it.tags = Array.isArray(it.tags) ? it.tags : [];
  it.meta = safeJsonParse(it.meta);
  it.imageUrl = typeof it.imageUrl === "string" ? it.imageUrl : "";
  it.sortYear =
    typeof it.sortYear === "number" ? it.sortYear :
    Number.isFinite(parseInt(it.sortYear, 10)) ? parseInt(it.sortYear, 10) :
    null;
  return it;
}

/* ---------------- data ---------------- */

async function loadItems() {
  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const json = await res.json();
  return Array.isArray(json.items)
    ? json.items.map(normalizeItem)
    : [];
}

/* ---------------- render ---------------- */

function renderMedia(type, imagePath, title) {
  const isBook = String(type).toLowerCase() === "book";

  if (!isBook) {
    return `
      <div class="card__media">
        ${imagePath ? `<img class="card__img" src="${imagePath}">` : ""}
        <div class="card__fade"></div>
      </div>
    `;
  }

  /* ⭐ KEY PART: ONE shared background + one shared gradient */
  return `
    <div class="card__media" style="
      position:relative;
      display:flex;
      gap:18px;
      align-items:stretch;
      overflow:hidden;
      border-radius:16px;
      background: radial-gradient(
        140% 120% at 18% 35%,
        rgba(255,255,255,0.12),
        rgba(0,0,0,0.92)
      );
    ">

      <!-- unified soft grey → black fade -->
      <div aria-hidden="true" style="
        position:absolute;
        inset:0;
        background:
          radial-gradient(
            140% 110% at 18% 38%,
            rgba(255,255,255,0.12),
            transparent 58%
          ),
          linear-gradient(
            90deg,
            rgba(255,255,255,0.10),
            rgba(0,0,0,0.78) 72%,
            rgba(0,0,0,0.97)
          );
        pointer-events:none;
        z-index:1;
      "></div>

      <!-- cover -->
      <div style="
        position:relative;
        z-index:2;
        flex:0 0 240px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:14px;
        border-radius:16px;
        overflow:hidden;
      ">
        <img
          src="${imagePath}"
          alt="${title}"
          style="
            width:100%;
            height:100%;
            object-fit:contain;
            border-radius:12px;
            filter:grayscale(1) contrast(1.05) brightness(.92);
          "
        >
      </div>

      <!-- dust -->
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
          style="position:absolute; inset:0; width:100%; height:100%;"
        ></canvas>
      </div>

      <div class="card__fade"></div>
    </div>
  `;
}

function render(items) {
  els.cards.innerHTML = items.map((item) => `
    <article class="card">
      <div class="card__row">
        ${renderMedia(
          item.type,
          escapeHtml(item.imageUrl),
          escapeHtml(item.title)
        )}
        <div class="card__content">
          <div class="card__kicker">${escapeHtml(item.type)}</div>
          <h2 class="card__title">${escapeHtml(item.title)}</h2>
          ${item.summary ? `<p class="card__summary">${escapeHtml(item.summary)}</p>` : ""}
          ${
            item.tags?.length
              ? `<div class="card__meta">
                  ${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
                </div>`
              : ""
          }
        </div>
      </div>
    </article>
  `).join("");

  requestAnimationFrame(initDustCanvases);
}

/* ---------------- dust ---------------- */

const dustMap = new WeakMap();

function initDustCanvases() {
  document.querySelectorAll("canvas[data-dust]").forEach((c) => {
    if (!dustMap.has(c)) dustMap.set(c, createDust(c));
  });
}

function createDust(canvas) {
  const ctx = canvas.getContext("2d");
  let w, h;
  let parts = [];

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.width = r.width * dpr;
    h = canvas.height = r.height * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);

    parts = Array.from({ length: Math.max(300, (r.width*r.height)/3000) }, () => ({
      x: Math.random()*r.width,
      y: Math.random()*r.height,
      vx: 0,
      vy: 0,
      life: Math.random()*300
    }));
  }

  function step() {
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0,0,w,h);

    ctx.globalCompositeOperation = "lighter";
    parts.forEach(p => {
      const ox = p.x, oy = p.y;
      p.vx += (Math.random()-0.5)*0.02;
      p.vy += (Math.random()-0.5)*0.02;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x<0||p.y<0||p.x>w||p.y>h) {
        p.x=Math.random()*w;
        p.y=Math.random()*h;
        p.vx=p.vy=0;
      }

      ctx.strokeStyle="rgba(220,220,220,0.15)";
      ctx.beginPath();
      ctx.moveTo(ox,oy);
      ctx.lineTo(p.x,p.y);
      ctx.stroke();
    });
    ctx.globalCompositeOperation = "source-over";
    requestAnimationFrame(step);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  step();
}

/* ---------------- init ---------------- */

async function init() {
  if (els.year) els.year.textContent = new Date().getFullYear();
  allItems = await loadItems();
  render(allItems);
}

init();
