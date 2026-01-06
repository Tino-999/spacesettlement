// assets/js/app.js
// Loads items from Cloudflare Worker /items (D1) and renders cards.

/* ---------------- API base ---------------- */

async function loadApiBase() {
  const params = new URLSearchParams(location.search);
  const apiParam = params.get("api");
  if (apiParam) return apiParam.replace(/\/+$/, "");

  try {
    const res = await fetch("data/config.json", { cache: "no-store" });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg.apiBase === "string" && cfg.apiBase.trim()) {
        return cfg.apiBase.trim().replace(/\/+$/, "");
      }
    }
  } catch (_) {}

  return "https://spacesettlement-api.tinoschuldt100.workers.dev";
}

let WORKER_BASE = "";
let ITEMS_URL = "";

/* ---------------- DOM ---------------- */

const els = {
  q: document.getElementById("q"),
  cards: document.getElementById("cards"),
  year: document.getElementById("year"),
  typeChips: Array.from(document.querySelectorAll(".chip[data-filter]")),

  projectBox: document.getElementById("project-classes"),
  fictionBox: document.getElementById("fiction-classes"),
  topicBox: document.getElementById("topic-classes"),

  projectChips: Array.from(document.querySelectorAll(".chip[data-project-class]")),
  fictionChips: Array.from(document.querySelectorAll(".chip[data-fiction-class]")),
  topicChips: Array.from(document.querySelectorAll(".chip[data-topic]")),
};

let allItems = [];
let activeFilter = "all";
let activeProjectClass = "all";
let activeFictionClass = "all";
let activeTopicGroup = "all";

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

function normalizeGroupKey(s) {
  return normalizeText(s).replace(/\s+/g, " ").trim().toUpperCase();
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
  try { return JSON.parse(value); } catch { return null; }
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

  if (typeof it.project_class !== "string") it.project_class = it.project_class ?? null;
  if (typeof it.fiction_class !== "string") it.fiction_class = it.fiction_class ?? null;

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
    people: "people", projects: "projects", concepts: "concepts", orgs: "orgs",
    topics: "topics", books: "books", movies: "movies", fiction: "fiction",
    person: "people", project: "projects", concept: "concepts", org: "orgs",
    topic: "topics", book: "books", movie: "movies",
  };

  const folder = folderByType[type];
  return folder ? `assets/img/cards/${folder}/${img}` : `assets/img/cards/${img}`;
}

/* ---------------- helper: years & budget ---------------- */

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toYearOrNull(v) {
  const n = toNumberOrNull(v);
  if (n == null) return null;
  const y = Math.trunc(n);
  if (y < 1000 || y > 3000) return null;
  return y;
}

function getStartYear(item) {
  const meta = item && typeof item.meta === "object" ? item.meta : null;
  const candidates = [item?.startyear, item?.startYear, item?.start_year, meta?.startyear, meta?.startYear, meta?.start_year];
  for (const c of candidates) {
    const y = toYearOrNull(c);
    if (y != null) return y;
  }
  return null;
}

function getEndYear(item) {
  const meta = item && typeof item.meta === "object" ? item.meta : null;
  const candidates = [item?.endyear, item?.endYear, item?.end_year, meta?.endyear, meta?.endYear, meta?.end_year];
  for (const c of candidates) {
    const y = toYearOrNull(c);
    if (y != null) return y;
  }
  return null;
}

function getBudgetBillionUSD(item) {
  const meta = item && typeof item.meta === "object" ? item.meta : null;
  const candidates = [
    item?.budget, item?.budgetBillionUSD, item?.budgetBillionUsd, item?.budget_billion_usd,
    meta?.budget, meta?.budgetBillionUSD, meta?.budgetBillionUsd, meta?.budget_billion_usd,
  ];
  for (const c of candidates) {
    const n = toNumberOrNull(c);
    if (n != null) return n;
  }
  return null;
}

/* ---------------- data ---------------- */

async function loadItems() {
  if (!WORKER_BASE) {
    WORKER_BASE = await loadApiBase();
    ITEMS_URL = `${WORKER_BASE}/items`;
  }

  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const data = await res.json();

  if (data && typeof data === "object" && Array.isArray(data.items)) return data.items.map(normalizeItem);
  if (Array.isArray(data)) return data.map(normalizeItem);
  return [];
}

/* ---------------- filter/sort ---------------- */

const TYPE_MAP = {
  project: "projects", projects: "projects",
  fiction: "fiction",
  topic: "topics", topics: "topics",
  org: "orgs", orgs: "orgs", organization: "orgs",
  person: "people", people: "people",
  book: "books", books: "books",
  movie: "movies", movies: "movies",
  concept: "concepts", concepts: "concepts",
};

function normalizeTypeForFilter(type) {
  return TYPE_MAP[type] || null;
}

function setActiveChip(filter) {
  activeFilter = filter;

  els.typeChips.forEach((b) => b.classList.toggle("is-active", b.dataset.filter === filter));

  if (activeFilter !== "projects") activeProjectClass = "all";
  if (activeFilter !== "fiction") activeFictionClass = "all";
  if (activeFilter !== "topics") activeTopicGroup = "all";

  els.projectChips.forEach((b) => b.classList.remove("is-active"));
  els.fictionChips.forEach((b) => b.classList.remove("is-active"));
  els.topicChips.forEach((b) => b.classList.remove("is-active"));

  updateSubChipsVisibility();
}

function updateSubChipsVisibility() {
  if (els.projectBox) els.projectBox.hidden = activeFilter !== "projects";
  if (els.fictionBox) els.fictionBox.hidden = activeFilter !== "fiction";
  if (els.topicBox) els.topicBox.hidden = activeFilter !== "topics";
}

function normalizeKey(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function parseMeta(meta) {
  if (!meta) return null;
  if (typeof meta === "object") return meta;
  if (typeof meta === "string") {
    try { return JSON.parse(meta); } catch { return null; }
  }
  return null;
}

function passesFilter(item, q, filter) {
  const type = normalizeTypeForFilter(item.type);

  if (filter !== "all" && (!type || type !== filter)) return false;

  if (type === "projects" && activeProjectClass !== "all") {
    if (normalizeKey(item.project_class) !== normalizeKey(activeProjectClass)) return false;
  }

  if (type === "fiction" && activeFictionClass !== "all") {
    if (normalizeKey(item.fiction_class) !== normalizeKey(activeFictionClass)) return false;
  }

  if (type === "topics" && activeTopicGroup !== "all") {
    const meta = parseMeta(item.meta);
    const key = normalizeGroupKey(meta?.topicGroup || "");
    if (key !== activeTopicGroup) return false;
  }

  if (!q) return true;

  const meta = item.meta && typeof item.meta === "object" ? item.meta : null;

  const hay = [
    item.title, item.summary, item.href,
    ...(Array.isArray(item.tags) ? item.tags : []),
    type,
    meta ? JSON.stringify(meta) : "",
    item.project_class || "",
    item.fiction_class || "",
  ].map(normalizeText).join(" ");

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
      ${imagePath ? `<img class="card__img" src="${imagePath}" alt="${title}" loading="lazy">` : ``}
      <div class="card__fade" aria-hidden="true"></div>
    </div>
  `;
}

function renderMediaBook(imagePath, title) {
  const hasImg = Boolean(String(imagePath || "").trim());
  return `
    <div class="card__media" style="position:relative;display:flex;gap:18px;align-items:stretch;overflow:hidden;border-radius:16px;background:radial-gradient(140% 120% at 18% 35%, rgba(255,255,255,0.12), rgba(0,0,0,0.92));">
      <div aria-hidden="true" style="position:absolute;inset:0;background:radial-gradient(140% 110% at 18% 38%, rgba(255,255,255,0.12), transparent 58%),linear-gradient(90deg,rgba(255,255,255,0.10) 0%,rgba(120,120,120,0.08) 35%,rgba(0,0,0,0.55) 65%,rgba(0,0,0,0.85) 85%,rgba(0,0,0,0.97) 100%);pointer-events:none;z-index:1;"></div>

      <div data-cover style="position:relative;z-index:2;flex:0 0 240px;display:flex;align-items:center;justify-content:center;padding:14px;border-radius:16px;overflow:hidden;background:transparent;">
        ${
          hasImg
            ? `<img src="${imagePath}" alt="" loading="lazy" onerror="this.style.display='none';" style="width:100%;height:100%;object-fit:contain;display:block;border-radius:12px;filter: grayscale(1) contrast(1.05) brightness(.92);">`
            : ``
        }
      </div>

      <div style="position:relative;z-index:2;flex:1;min-height:340px;overflow:hidden;border-radius:16px;background:transparent;"></div>
      <div class="card__fade" aria-hidden="true"></div>
    </div>
  `;
}

function renderMedia(type, imagePath, title) {
  const t = String(type || "").toLowerCase();
  if (t === "book" || t === "books") return renderMediaBook(imagePath, title);
  return renderMediaDefault(imagePath, title);
}

/* ---------------- i18n re-apply ---------------- */

function reapplyI18nSoon() {
  // i18n.js lädt asynchron; wir versuchen "best-effort" nach DOM-Update.
  if (typeof window.applyI18n !== "function") return;
  queueMicrotask(() => {
    try { window.applyI18n(); } catch (_) {}
  });
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
    reapplyI18nSoon();
    return;
  }

  els.cards.innerHTML = items.map((item) => {
    const type = String(item.type || "").toLowerCase();
    const titleFallback = escapeHtml(item.title || "");
    const href = escapeHtml(item.href || "");
    const summaryFallback = escapeHtml(item.summary || "");
    const imagePath = escapeHtml(resolveImagePath(item));
    const hasLink = href && href !== "kein Wiki";

    const start = getStartYear(item);
    const endRaw = getEndYear(item);
    const budget = getBudgetBillionUSD(item);
    const end = (start != null && endRaw != null && endRaw >= start) ? endRaw : null;

    const titleKey = `item.${item.id}.title`;
    const summaryKey = `item.${item.id}.summary`;

    let factsHtml = "";
    if (start != null || budget != null) {
      factsHtml += `<div class="card__facts">`;
      if (start != null) factsHtml += `<div>Zeitraum: ${end != null ? `${start}-${end}` : start}</div>`;
      if (budget != null) factsHtml += `<div>Budget: ${escapeHtml(String(budget))} Mrd. USD</div>`;
      factsHtml += `</div>`;
    }

    const titleHtml = hasLink
      ? `<a href="${href}" target="_blank" rel="noopener" data-i18n="${titleKey}">${titleFallback}</a>`
      : `<span data-i18n="${titleKey}">${titleFallback}</span>`;

    const summaryHtml = summaryFallback
      ? `<p class="card__summary" data-i18n="${summaryKey}">${summaryFallback}</p>`
      : ``;

    return `
      <article class="card">
        <div class="card__row">
          ${renderMedia(type, imagePath, titleFallback)}

          <div class="card__content">
            <div class="card__kicker">${escapeHtml(type)}</div>

            <h2 class="card__title">
              ${titleHtml}
            </h2>

            ${summaryHtml}
            ${factsHtml}
          </div>
        </div>
      </article>
    `;
  }).join("");

  reapplyI18nSoon();
}

/* ---------------- init ---------------- */

function applyAndRender() {
  const q = normalizeText(els.q?.value || "");
  const filtered = allItems.filter((it) => passesFilter(it, q, activeFilter));

  filtered.sort((a, b) => {
    const ay = getStartYear(a);
    const by = getStartYear(b);
    if (ay != null && by != null && ay !== by) return ay - by;
    if (ay != null && by == null) return -1;
    if (ay == null && by != null) return 1;
    return 0;
  });

  render(filtered);
}

function setActiveSubChip(buttons, activeButton) {
  buttons.forEach((b) => b.classList.toggle("is-active", b === activeButton));
}

async function init() {
  if (els.year) els.year.textContent = String(new Date().getFullYear());
  updateSubChipsVisibility();

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
    reapplyI18nSoon();
    return;
  }

  allItems = sortItemsByYear(allItems);

  els.typeChips.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveChip(btn.dataset.filter || "all");
      applyAndRender();
    });
  });

  els.projectChips.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeProjectClass = String(btn.dataset.projectClass || "").trim() || "all";
      setActiveSubChip(els.projectChips, btn);
      applyAndRender();
    });
  });

  els.fictionChips.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFictionClass = String(btn.dataset.fictionClass || "").trim() || "all";
      setActiveSubChip(els.fictionChips, btn);
      applyAndRender();
    });
  });

  els.topicChips.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTopicGroup = normalizeGroupKey(btn.dataset.topic || "") || "all";
      setActiveSubChip(els.topicChips, btn);
      applyAndRender();
    });
  });

  els.q?.addEventListener("input", () => applyAndRender());

  setActiveChip("all");
  applyAndRender();
}

init();

/* Admin link via CF_Authorization cookie */
(function () {
  const adminLink = document.getElementById("admin-link");
  if (!adminLink) return;

  const hasAccessSession = document.cookie.split(";").some((c) => c.trim().startsWith("CF_Authorization="));
  if (hasAccessSession) {
    adminLink.style.display = "inline-block";
    adminLink.removeAttribute("hidden");
  } else {
    adminLink.style.display = "none";
    adminLink.setAttribute("hidden", "hidden");
  }
})();
