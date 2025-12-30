// editor.js (FULL)
// Usage: /admin.html?api=https://<your-worker>.workers.dev

const $ = (id) => document.getElementById(id);

const DEFAULT_WORKER_BASE = "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";
const WORKER_BASE = (() => {
  const p = new URLSearchParams(location.search);
  const api = (p.get("api") || "").trim();
  return (api || DEFAULT_WORKER_BASE).replace(/\/+$/, "");
})();

const ITEMS_URL = `${WORKER_BASE}/items`;
const UPLOAD_URL = `${WORKER_BASE}/upload-image`;
const BOOK_SUGGEST_URL = `${WORKER_BASE}/books/suggest`;
const BOOK_AUTOFILL_URL = `${WORKER_BASE}/books/autofill`;
const BOOK_ENRICH_URL = `${WORKER_BASE}/books/enrich`;

const publishedEl = $("published");

let latestBookSuggestions = [];
let lastBookQuery = "";
let lastBookFacts = null;

// -------------------------
// Helpers
// -------------------------
const normalizeType = (t) => {
  const s = String(t || "").trim().toLowerCase();
  if (s === "books") return "book";
  if (s === "people") return "person";
  if (s === "projects") return "project";
  if (s === "orgs") return "org";
  if (s === "topics") return "topic";
  if (s === "concepts") return "concept";
  if (s === "movies") return "movie";
  return s;
};

function getValue(id) {
  const el = $(id);
  if (!el) return "";
  return (el.value ?? "").toString().trim();
}
function setValue(id, v) {
  const el = $(id);
  if (!el) return;
  el.value = v == null ? "" : String(v);
}
function setOutput(objOrText) {
  const out = $("output");
  if (!out) return;
  out.textContent = typeof objOrText === "string" ? objOrText : JSON.stringify(objOrText, null, 2);
}
async function safeReadJson(res) {
  const text = await res.text();
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, raw: text };
  }
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function requireAdminToken(actionLabel = "Aktion") {
  const key = "spacesettlement_admin_token";
  let token = localStorage.getItem(key);
  if (!token) {
    token = prompt(`${actionLabel}: Bitte Admin Token eingeben (wird lokal gespeichert)`);
    if (token) localStorage.setItem(key, token);
  }
  return token || "";
}

function isBookType() {
  return normalizeType(getValue("type")) === "book";
}

// -------------------------
// Build item from form
// -------------------------
function buildItem() {
  const type = normalizeType(getValue("type"));
  const title = getValue("title");

  const item = {
    type,
    title,
    href: getValue("href"),
    imageUrl: getValue("imageUrl") || "",
    summary: getValue("summary"),
    tags: getValue("tags")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    meta: null,
  };

  // person meta (optional)
  if (type === "person") {
    const meta = {};
    const birthYear = Number(getValue("birthYear")) || null;
    const deathYear = Number(getValue("deathYear")) || null;
    const nationality = getValue("nationality");
    const affiliations = getValue("affiliations");
    const fields = getValue("fields");
    const roles = getValue("roles");
    const activeStartYear = Number(getValue("activeStartYear")) || null;
    const activeEndYear = Number(getValue("activeEndYear")) || null;

    if (birthYear) meta.birthYear = birthYear;
    if (deathYear) meta.deathYear = deathYear;
    if (nationality) meta.nationality = nationality.split(",").map((s) => s.trim()).filter(Boolean);
    if (affiliations) meta.affiliations = affiliations.split(",").map((s) => s.trim()).filter(Boolean);
    if (fields) meta.fields = fields.split(",").map((s) => s.trim()).filter(Boolean);
    if (roles) meta.roles = roles.split(",").map((s) => s.trim()).filter(Boolean);
    if (activeStartYear) meta.activeStartYear = activeStartYear;
    if (activeEndYear) meta.activeEndYear = activeEndYear;

    item.meta = Object.keys(meta).length ? meta : null;
  }

  // book meta
  if (type === "book") {
    const meta = {};
    const authors = getValue("authors")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const publishedYear = Number(getValue("publishedYear")) || null; // edition
    const firstPublishYear = Number(getValue("firstPublishYear")) || null; // original
    const publisher = getValue("publisher");
    const isbn = getValue("isbn");
    const language = getValue("language");

    if (authors.length) meta.authors = authors;
    if (publishedYear) meta.publishedYear = publishedYear;
    if (firstPublishYear) meta.firstPublishYear = firstPublishYear;
    if (publisher) meta.publisher = publisher;
    if (isbn) meta.isbn = isbn;
    if (language) meta.language = language;

    if (lastBookFacts?.openLibraryId) meta.openLibraryId = lastBookFacts.openLibraryId;
    if (lastBookFacts?.wikipediaUrl) meta.wikipediaUrl = lastBookFacts.wikipediaUrl;

    item.meta = Object.keys(meta).length ? meta : null;
  }

  return item;
}

// -------------------------
// Fill form from an item (LOAD)
// -------------------------
function fillFormFromItem(it) {
  if (!it) return;

  setValue("type", normalizeType(it.type));
  setValue("title", it.title || "");
  setValue("href", it.href || "");
  setValue("imageUrl", it.imageUrl || "");
  setValue("summary", it.summary || "");
  setValue("tags", Array.isArray(it.tags) ? it.tags.join(", ") : "");

  const meta = it.meta && typeof it.meta === "object" ? it.meta : null;

  // clear all optional fields first
  [
    "authors","publishedYear","firstPublishYear","publisher","isbn","language",
    "birthYear","deathYear","nationality","affiliations","fields","roles","activeStartYear","activeEndYear",
  ].forEach((id) => setValue(id, ""));

  if (normalizeType(it.type) === "book" && meta) {
    if (Array.isArray(meta.authors)) setValue("authors", meta.authors.join(", "));
    if (typeof meta.publishedYear === "number") setValue("publishedYear", meta.publishedYear);
    if (typeof meta.firstPublishYear === "number") setValue("firstPublishYear", meta.firstPublishYear);
    if (meta.publisher) setValue("publisher", meta.publisher);
    if (meta.isbn) setValue("isbn", meta.isbn);
    if (meta.language) setValue("language", meta.language);

    lastBookFacts = {
      openLibraryId: meta.openLibraryId || null,
      wikipediaUrl: meta.wikipediaUrl || null,
    };
  }

  if (normalizeType(it.type) === "person" && meta) {
    if (typeof meta.birthYear === "number") setValue("birthYear", meta.birthYear);
    if (typeof meta.deathYear === "number") setValue("deathYear", meta.deathYear);
    if (Array.isArray(meta.nationality)) setValue("nationality", meta.nationality.join(", "));
    if (Array.isArray(meta.affiliations)) setValue("affiliations", meta.affiliations.join(", "));
    if (Array.isArray(meta.fields)) setValue("fields", meta.fields.join(", "));
    if (Array.isArray(meta.roles)) setValue("roles", meta.roles.join(", "));
    if (typeof meta.activeStartYear === "number") setValue("activeStartYear", meta.activeStartYear);
    if (typeof meta.activeEndYear === "number") setValue("activeEndYear", meta.activeEndYear);
  }

  setOutput({ ok: true, loaded: it });
  updateTypeVisibility();
}

// -------------------------
// Upload image (R2)
// -------------------------
async function uploadImageToR2() {
  const fileInput = $("imageFile");
  const urlInput = $("imageUrl");
  if (!fileInput) return setOutput('Fehler: <input id="imageFile"> nicht gefunden.');

  const file = fileInput.files && fileInput.files[0];
  if (!file) return setOutput("Bitte zuerst eine Bilddatei auswählen.");

  const token = requireAdminToken("Upload");
  if (!token) return setOutput("Upload abgebrochen (kein Token).");

  const btn = $("uploadImage");
  if (btn) btn.disabled = true;

  try {
    setOutput(`Uploading…\nPOST ${UPLOAD_URL}`);

    const form = new FormData();
    form.append("file", file, file.name);

    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { "x-admin-token": token },
      body: form,
    });

    const parsed = await safeReadJson(res);
    if (!res.ok) {
      return setOutput(
        `Upload Fehler (${res.status}):\n${parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw}`
      );
    }

    const data = parsed.ok ? parsed.json : null;
    if (!data?.imageUrl) return setOutput("Upload ok, aber keine imageUrl in Antwort.");

    if (urlInput) urlInput.value = data.imageUrl;
    setOutput({ ok: true, upload: data });
  } catch (e) {
    setOutput("Upload Fehler:\n" + (e?.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

// -------------------------
// Publish
// -------------------------
async function publishItem() {
  const token = requireAdminToken("Publish");
  if (!token) return setOutput("Publish abgebrochen (kein Token).");

  const item = buildItem();
  if (!item.type) return setOutput("Fehler: type fehlt.");
  if (!item.title) return setOutput("Fehler: title fehlt.");

  setOutput(`Publishing…\nPOST ${ITEMS_URL}`);

  let res;
  try {
    res = await fetch(ITEMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(item),
    });
  } catch (e) {
    return setOutput("Publish Fehler: Failed to fetch\n" + (e?.message || e));
  }

  const parsed = await safeReadJson(res);
  if (!res.ok) {
    return setOutput(
      "Publish Fehler (" +
        res.status +
        "):\n" +
        (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
    );
  }

  setOutput({ ok: true, published: parsed.ok ? parsed.json : null });
  alert("Item veröffentlicht ✔");
  await loadPublished();
}

// -------------------------
// Delete (ADMIN)
// -------------------------
async function deleteItem(id) {
  const token = requireAdminToken("Delete");
  if (!token) return setOutput("Delete abgebrochen (kein Token).");
  if (!id) return setOutput("Delete Fehler: missing id.");

  if (!confirm("Wirklich löschen?")) return;

  setOutput(`Deleting…\nDELETE ${ITEMS_URL}?id=${encodeURIComponent(id)}`);

  let res;
  try {
    res = await fetch(`${ITEMS_URL}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-token": token },
    });
  } catch (e) {
    return setOutput("Delete Fehler: Failed to fetch\n" + (e?.message || e));
  }

  const parsed = await safeReadJson(res);
  if (!res.ok) {
    return setOutput(
      "Delete Fehler (" +
        res.status +
        "):\n" +
        (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
    );
  }

  setOutput({ ok: true, deleted: id });
  await loadPublished();
}

// -------------------------
// List published (with LOAD/DELETE)
// -------------------------
async function loadPublished() {
  if (!publishedEl) return;

  try {
    const res = await fetch(ITEMS_URL);
    const parsed = await safeReadJson(res);
    if (!res.ok) {
      publishedEl.textContent = `Fehler ${res.status}: ${parsed.ok ? JSON.stringify(parsed.json) : parsed.raw}`;
      return;
    }

    const items = parsed.json?.items || [];
    publishedEl.innerHTML = "";

    // store items on element for quick load by id
    publishedEl._itemsById = new Map(items.map((it) => [it.id, it]));

    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "8px";

    items.slice(0, 300).forEach((it) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto auto";
      row.style.gap = "10px";
      row.style.alignItems = "center";
      row.style.padding = "8px 10px";
      row.style.borderBottom = "1px solid rgba(255,255,255,0.08)";

      const left = document.createElement("div");
      left.innerHTML = `<div style="font-weight:600">${escapeHtml(it.type)} · ${escapeHtml(it.title)}</div>
        <div style="opacity:.7; font-size:12px">${escapeHtml(it.id)}</div>`;

      const btnLoad = document.createElement("button");
      btnLoad.className = "btn btn--ghost";
      btnLoad.type = "button";
      btnLoad.textContent = "Load";
      btnLoad.dataset.loadId = it.id;

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn--ghost";
      btnDel.type = "button";
      btnDel.textContent = "Delete";
      btnDel.dataset.delId = it.id;

      row.appendChild(left);
      row.appendChild(btnLoad);
      row.appendChild(btnDel);
      wrap.appendChild(row);
    });

    publishedEl.appendChild(wrap);
  } catch (e) {
    publishedEl.textContent = "Load Fehler: " + (e?.message || e);
  }
}

// Click delegation for LOAD/DELETE
publishedEl?.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;

  const loadId = t.dataset?.loadId;
  const delId = t.dataset?.delId;

  if (loadId && publishedEl?._itemsById?.has(loadId)) {
    const it = publishedEl._itemsById.get(loadId);
    fillFormFromItem(it);
    return;
  }

  if (delId) {
    deleteItem(delId).catch((e) => setOutput(e?.message || e));
  }
});

// -------------------------
// Books: Suggest + Autofill
// -------------------------
async function fetchBookSuggestions(q) {
  const res = await fetch(`${BOOK_SUGGEST_URL}?q=${encodeURIComponent(q)}`);
  const parsed = await safeReadJson(res);
  if (!res.ok) throw new Error(parsed.ok ? JSON.stringify(parsed.json) : parsed.raw);
  return parsed.json?.suggestions || [];
}

async function booksAutofillFacts(openLibraryId) {
  const res = await fetch(BOOK_AUTOFILL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openLibraryId }),
  });
  const parsed = await safeReadJson(res);
  if (!res.ok) throw new Error(parsed.ok ? JSON.stringify(parsed.json) : parsed.raw);
  return parsed.json;
}

async function booksEnrichSummaryTags(facts) {
  const res = await fetch(BOOK_ENRICH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facts),
  });
  const parsed = await safeReadJson(res);
  if (!res.ok) throw new Error(parsed.ok ? JSON.stringify(parsed.json) : parsed.raw);

  const s = parsed.json?.summary || "";
  const tags = Array.isArray(parsed.json?.tags) ? parsed.json.tags : [];

  if (s) setValue("summary", s);
  if (tags.length) setValue("tags", tags.join(", "));
}

function pickBestBookSuggestion(titleText) {
  const t = String(titleText || "").trim().toLowerCase();
  if (!latestBookSuggestions.length) return null;

  // 1) prefer mapped original (worker marks it)
  const mapped = latestBookSuggestions.find((s) => s && s.mappedFromGermanTitle === true);
  if (mapped) return mapped;

  // 2) exact match
  const exact = latestBookSuggestions.find((s) => String(s.title || "").trim().toLowerCase() === t);
  if (exact) return exact;

  // 3) fallback: first
  return latestBookSuggestions[0];
}

async function runBookAutofill() {
  if (!isBookType()) return;

  const title = getValue("title");
  if (!title || title.length < 2) return setOutput("Bitte einen Buchtitel eingeben.");

  const match = pickBestBookSuggestion(title);
  if (!match?.openLibraryId) {
    return setOutput("Bitte einen Vorschlag auswählen (oder kurz warten, bis Vorschläge da sind).");
  }

  try {
    setOutput("Autofill läuft… (facts)");
    const facts = await booksAutofillFacts(match.openLibraryId);
    lastBookFacts = facts;

    // Work title/authors (original)
    if (facts.title) setValue("title", facts.title);
    if (Array.isArray(facts.authors)) setValue("authors", facts.authors.join(", "));

    // Concrete edition
    if (facts.publishedYear) setValue("publishedYear", facts.publishedYear);
    if (facts.publisher) setValue("publisher", facts.publisher);
    if (facts.isbn) setValue("isbn", facts.isbn);
    if (facts.language) setValue("language", facts.language);

    // Original first publish year (separately)
    if (facts.firstPublishYear) setValue("firstPublishYear", facts.firstPublishYear);

    // Wikipedia best effort
    if (facts.wikipediaUrl) setValue("href", facts.wikipediaUrl);

    // Cover auto
    if (facts.coverUrl) {
      const cur = getValue("imageUrl");
      if (!cur || cur.includes("assets/") || cur.includes("...")) setValue("imageUrl", facts.coverUrl);
    }

    setOutput("Autofill läuft… (AI summary/tags)");
    await booksEnrichSummaryTags({
      title: facts.title,
      authors: facts.authors || [],
      publishedYear: facts.publishedYear || null,
      publisher: facts.publisher || "",
      isbn: facts.isbn || "",
      language: facts.language || "",
      subjects: facts.subjects || [],
      firstPublishYear: facts.firstPublishYear || null,
    });

    setOutput(buildItem());
  } catch (e) {
    setOutput("Autofill Fehler: " + (e?.message || e));
  }
}

// Live suggestions for books (datalist)
$("title")?.addEventListener("input", async () => {
  if (!isBookType()) return;

  const q = getValue("title");
  const list = $("titleSuggestions");
  if (!list) return;

  list.innerHTML = "";
  latestBookSuggestions = [];

  if (!q || q.length < 2) return;
  if (q.toLowerCase() === lastBookQuery.toLowerCase()) return;
  lastBookQuery = q;

  try {
    latestBookSuggestions = await fetchBookSuggestions(q);
  } catch (e) {
    setOutput("Suggest Fehler:\n" + (e?.message || e));
    latestBookSuggestions = [];
    return;
  }

  latestBookSuggestions.slice(0, 12).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.title;
    list.appendChild(opt);
  });
});

// -------------------------
// Type switching: show/hide field groups
// -------------------------
function updateTypeVisibility() {
  const t = normalizeType(getValue("type"));
  const personFields = $("personFields");
  const bookFields = $("bookFields");
  if (personFields) personFields.style.display = t === "person" ? "" : "none";
  if (bookFields) bookFields.style.display = t === "book" ? "" : "none";
}

$("type")?.addEventListener("change", () => {
  updateTypeVisibility();
  latestBookSuggestions = [];
  lastBookQuery = "";
  lastBookFacts = null;
});

// Buttons
$("generate")?.addEventListener("click", (e) => {
  e.preventDefault();
  setOutput(buildItem());
});
$("publish")?.addEventListener("click", (e) => {
  e.preventDefault();
  publishItem().catch((err) => setOutput(err?.message || err));
});
$("refreshList")?.addEventListener("click", (e) => {
  e.preventDefault();
  loadPublished().catch((err) => setOutput(err?.message || err));
});
$("uploadImage")?.addEventListener("click", (e) => {
  e.preventDefault();
  uploadImageToR2().catch((err) => setOutput(err?.message || err));
});
$("autofill")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (isBookType()) runBookAutofill();
  else setOutput("Auto-Fill ist aktuell nur für book aktiv.");
});

updateTypeVisibility();
loadPublished().catch(console.error);
setOutput(`Editor loaded.\nAPI: ${WORKER_BASE}`);
