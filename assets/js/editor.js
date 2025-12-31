async function loadApiBase() {
  // 1) URL-Override per ?api=
  const params = new URLSearchParams(location.search);
  const apiParam = params.get("api");
  if (apiParam) return apiParam.replace(/\/+$/, "");

  // 2) data/config.json
  try {
    const res = await fetch("data/config.json", { cache: "no-store" });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg.apiBase === "string" && cfg.apiBase.trim()) {
        return cfg.apiBase.trim().replace(/\/+$/, "");
      }
    }
  } catch (_) {}

  // 3) Fallback
  return "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";
}


// editor.js (FULL)
// /admin?api=https://<your-worker>.workers.dev

const $ = (id) => document.getElementById(id);

let DEFAULT_WORKER_BASE = "";
let WORKER_BASE = "";


let ITEMS_URL = "";
let UPLOAD_URL = "";
let BOOK_SUGGEST_URL = "";
let BOOK_AUTOFILL_URL = "";
let BOOK_ENRICH_URL = "";

const publishedEl = $("published");

let latestBookSuggestions = [];
let lastBookQuery = "";
let lastBookFacts = null;

// Cache for published items (id -> item)
let publishedCache = new Map();

// -------------------------
// Helpers
// -------------------------
const normalizeType = (t) => {
  const s = String(t || "").trim().toLowerCase();
  if (s === "books") return "book";
  if (s === "people") return "person";
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

function requireAdminToken(actionLabel = "Aktion") {
  const key = "spacesettlement_admin_token";
  let token = localStorage.getItem(key);
  if (!token) {
    token = prompt(`${actionLabel}: Bitte Admin Token eingeben (wird lokal gespeichert)`);
    if (token) localStorage.setItem(key, token);
  }
  return token || "";
}

function showFieldsForType(type) {
  const t = normalizeType(type);
  const person = $("personFields");
  const book = $("bookFields");
  if (person) person.style.display = t === "person" ? "block" : "none";
  if (book) book.style.display = t === "book" ? "block" : "none";

  // First publish year field is book-only (if present)
  const fpy = $("firstPublishYear");
  if (fpy) {
    const container = fpy.closest(".field") || fpy.parentElement;
    if (container) container.style.display = t === "book" ? "block" : "none";
  }
    // Clear class/group fields when they do not apply
  if (t !== "project") {
    const pc = $("projectClass");
    if (pc) pc.value = "";
    const chips = $("projectClassChips");
    chips?.querySelectorAll("button").forEach(b => b.classList.remove("is-active", "active"));
  }

  if (t !== "fiction") {
    const fc = $("fictionClass");
    if (fc) fc.value = "";
    const chips = $("fictionClassChips");
    chips?.querySelectorAll("button").forEach(b => b.classList.remove("is-active", "active"));
  }

  if (t !== "topic") {
    const tg = $("topicGroup");
    if (tg) tg.value = "";
    const chips = $("topicGroupChips");
    chips?.querySelectorAll("button").forEach(b => b.classList.remove("is-active", "active"));
  }

}

function buildItem() {
  const type = normalizeType(getValue("type"));
  const title = getValue("title");
  const projectClass = getValue("projectClass"); // hidden input
  const fictionClass = getValue("fictionClass"); // hidden input
  const topicGroup = getValue("topicGroup");     // hidden input

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
    project_class: null,
    fiction_class: null,
  };

    if (type === "project") {
    item.project_class = projectClass || null;
  }

  if (type === "fiction") {
    item.fiction_class = fictionClass || null;
  }

  if (type === "topic") {
    // Für Topic reicht bei dir die Gruppierung (LAW / RELIGION / SETTLEMENT ARCHITECTURES).
    // Wir speichern sie in meta, ohne das DB-Schema zu erweitern.
    item.meta = item.meta || {};
    item.meta.topicGroup = topicGroup || null;
  }


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

  if (type === "person") {
    const meta = {};
    const birthYear = Number(getValue("birthYear")) || null;
    const deathYear = Number(getValue("deathYear")) || null;

    const nationality = getValue("nationality")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const affiliations = getValue("affiliations")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fields = getValue("fields")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const roles = getValue("roles")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const activeStartYear = Number(getValue("activeStartYear")) || null;
    const activeEndYear = Number(getValue("activeEndYear")) || null;

    if (birthYear) meta.birthYear = birthYear;
    if (deathYear) meta.deathYear = deathYear;
    if (nationality.length) meta.nationality = nationality;
    if (affiliations.length) meta.affiliations = affiliations;
    if (fields.length) meta.fields = fields;
    if (roles.length) meta.roles = roles;
    if (activeStartYear) meta.activeStartYear = activeStartYear;
    if (activeEndYear) meta.activeEndYear = activeEndYear;

    item.meta = Object.keys(meta).length ? meta : null;
  }

  return item;
}

// -------------------------
// Upload image
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
// Delete
// -------------------------
async function deleteItemById(id) {
  const token = requireAdminToken("Delete");
  if (!token) return setOutput("Delete abgebrochen (kein Token).");

  if (!id) return setOutput("Delete Fehler: missing id");

  const ok = confirm("Wirklich löschen?");
  if (!ok) return;

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
// Load into form (for editing / re-publish as new item)
// -------------------------
function loadItemIntoForm(item) {
  if (!item) return;

  // base fields
  setValue("type", normalizeType(item.type));
  showFieldsForType(item.type);

  setValue("title", item.title || "");
  setValue("href", item.href || "");
  setValue("imageUrl", item.imageUrl || "");
  setValue("summary", item.summary || "");
  setValue("tags", Array.isArray(item.tags) ? item.tags.join(", ") : (item.tags || ""));

  // reset type-specific fields
  const t = normalizeType(item.type);
  if (t === "book") {
    const meta = item.meta && typeof item.meta === "object" ? item.meta : {};

    setValue("authors", Array.isArray(meta.authors) ? meta.authors.join(", ") : "");
    setValue("publishedYear", meta.publishedYear ?? "");
    setValue("firstPublishYear", meta.firstPublishYear ?? "");
    setValue("publisher", meta.publisher ?? "");
    setValue("isbn", meta.isbn ?? "");
    setValue("language", meta.language ?? "");

    // keep lastBookFacts minimal so publish preserves openLibraryId/wiki
    lastBookFacts = {
      openLibraryId: meta.openLibraryId || null,
      wikipediaUrl: meta.wikipediaUrl || null,
    };
  } else if (t === "person") {
    const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
    setValue("birthYear", meta.birthYear ?? "");
    setValue("deathYear", meta.deathYear ?? "");
    setValue("nationality", Array.isArray(meta.nationality) ? meta.nationality.join(", ") : "");
    setValue("affiliations", Array.isArray(meta.affiliations) ? meta.affiliations.join(", ") : "");
    setValue("fields", Array.isArray(meta.fields) ? meta.fields.join(", ") : "");
    setValue("roles", Array.isArray(meta.roles) ? meta.roles.join(", ") : "");
    setValue("activeStartYear", meta.activeStartYear ?? "");
    setValue("activeEndYear", meta.activeEndYear ?? "");
  }

  // Show user what was loaded (including id)
  setOutput({ loaded: item });
}

// -------------------------
// List published (WITH Load/Delete buttons again)
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
    publishedCache = new Map(items.map((it) => [it.id, it]));

    publishedEl.innerHTML = "";

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    ul.style.margin = "0";

    items.slice(0, 250).forEach((it) => {
      const li = document.createElement("li");
      li.style.padding = "10px 0";
      li.style.borderBottom = "1px solid rgba(255,255,255,0.08)";
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.justifyContent = "space-between";
      li.style.gap = "12px";

      const left = document.createElement("div");
      left.style.minWidth = "0";

      const t = document.createElement("div");
      t.textContent = `${normalizeType(it.type)} · ${it.title}`;
      t.style.fontWeight = "600";
      t.style.whiteSpace = "nowrap";
      t.style.overflow = "hidden";
      t.style.textOverflow = "ellipsis";

      const small = document.createElement("div");
      small.textContent = it.id ? `id: ${it.id}` : "";
      small.style.opacity = "0.65";
      small.style.fontSize = "12px";
      small.style.marginTop = "2px";

      left.appendChild(t);
      left.appendChild(small);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.flexShrink = "0";

      const btnLoad = document.createElement("button");
      btnLoad.type = "button";
      btnLoad.className = "btn btn--ghost";
      btnLoad.textContent = "Load";
      btnLoad.addEventListener("click", () => loadItemIntoForm(it));

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn";
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", () => deleteItemById(it.id));

      right.appendChild(btnLoad);
      right.appendChild(btnDel);

      li.appendChild(left);
      li.appendChild(right);
      ul.appendChild(li);
    });

    publishedEl.appendChild(ul);
  } catch (e) {
    publishedEl.textContent = "Load Fehler: " + (e?.message || e);
  }
}

// -------------------------
// Books: Suggest + Autofill
// -------------------------
const isBookType = () => normalizeType(getValue("type")) === "book";

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

  const mapped = latestBookSuggestions.find((s) => s && s.mappedFromGermanTitle === true);
  if (mapped) return mapped;

  const exact = latestBookSuggestions.find((s) => String(s.title || "").toLowerCase() === t);
  if (exact) return exact;

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

    if (facts.title) setValue("title", facts.title);
    if (Array.isArray(facts.authors)) setValue("authors", facts.authors.join(", "));

    if (facts.publishedYear) setValue("publishedYear", facts.publishedYear);
    if (facts.publisher) setValue("publisher", facts.publisher);
    if (facts.isbn) setValue("isbn", facts.isbn);
    if (facts.language) setValue("language", facts.language);

    if (facts.firstPublishYear) setValue("firstPublishYear", facts.firstPublishYear);

    if (facts.wikipediaUrl) setValue("href", facts.wikipediaUrl);

    if (facts.coverUrl) {
      const cur = getValue("imageUrl");
      if (!cur || cur.includes("assets/img/") || cur.includes("...images/file")) {
        setValue("imageUrl", facts.coverUrl);
      }
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

// -------------------------
// Event wiring
// -------------------------
$("type")?.addEventListener("change", () => {
  showFieldsForType(getValue("type"));
});

// Live suggestions (book titles)
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
  loadPublished().catch(console.error);
});
$("uploadImage")?.addEventListener("click", (e) => {
  e.preventDefault();
  uploadImageToR2().catch(console.error);
});
$("autofill")?.addEventListener("click", (e) => {
  e.preventDefault();
  runBookAutofill();
});

// Init
showFieldsForType(getValue("type"));
loadPublished().catch(console.error);
setOutput(`Editor loaded.\nAPI: ${WORKER_BASE}`);

async function init() {
  // apiBase aus ?api= oder data/config.json oder Fallback
  DEFAULT_WORKER_BASE = await loadApiBase();
  WORKER_BASE = DEFAULT_WORKER_BASE;

  // abgeleitete Endpunkte erst jetzt setzen
  ITEMS_URL = `${WORKER_BASE}/items`;
  UPLOAD_URL = `${WORKER_BASE}/upload-image`;
  BOOK_SUGGEST_URL = `${WORKER_BASE}/books/suggest`;
  BOOK_AUTOFILL_URL = `${WORKER_BASE}/books/autofill`;
  BOOK_ENRICH_URL = `${WORKER_BASE}/books/enrich`;
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => setOutput(String(e?.message || e)));
});
