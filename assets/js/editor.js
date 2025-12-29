// editor.js (FULL)
// /admin?api=https://<your-worker>.workers.dev

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
  return s;
};
const isBookType = () => normalizeType(getValue("type")) === "book";

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
// Upload image (optional; but now you usually won’t need it)
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
// List published
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

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    ul.style.margin = "0";

    items.slice(0, 200).forEach((it) => {
      const li = document.createElement("li");
      li.style.padding = "8px 0";
      li.style.borderBottom = "1px solid rgba(255,255,255,0.08)";

      const t = document.createElement("div");
      t.textContent = `${it.type} · ${it.title}`;
      t.style.fontWeight = "600";

      li.appendChild(t);
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
  const exact = latestBookSuggestions.find((s) => String(s.title || "").toLowerCase() === t);
  if (exact) return exact;

  // 3) fallback: first
  return latestBookSuggestions[0];
}

async function runBookAutofill() {
  if (!isBookType()) return;

  const title = getValue("title");
  if (!title || title.length < 2) return setOutput("Bitte einen Buchtitel eingeben.");

  const match = pickBestBookSuggestion(title);
  if (!match?.openLibraryId) return setOutput("Bitte einen Vorschlag auswählen (oder kurz warten, bis Vorschläge da sind).");

  try {
    setOutput("Autofill läuft… (facts)");
    const facts = await booksAutofillFacts(match.openLibraryId);
    lastBookFacts = facts;

    // Always switch title/authors to ORIGINAL work title if mapping was used
    if (facts.title) setValue("title", facts.title);
    if (Array.isArray(facts.authors)) setValue("authors", facts.authors.join(", "));

    // Concrete edition
    if (facts.publishedYear) setValue("publishedYear", facts.publishedYear);
    if (facts.publisher) setValue("publisher", facts.publisher);
    if (facts.isbn) setValue("isbn", facts.isbn);
    if (facts.language) setValue("language", facts.language);

    // Original first publish year (separately)
    if (facts.firstPublishYear) setValue("firstPublishYear", facts.firstPublishYear);

    // Link to Wikipedia (best effort)
    if (facts.wikipediaUrl) setValue("href", facts.wikipediaUrl);

    // Cover auto (use OpenLibrary cover if present)
    if (facts.coverUrl) {
      // only overwrite if empty OR looks like placeholder
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

// Live suggestions
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
$("generate")?.addEventListener("click", () => setOutput(buildItem()));
$("publish")?.addEventListener("click", () => publishItem().catch((e) => setOutput(e?.message || e)));
$("refreshList")?.addEventListener("click", () => loadPublished().catch(console.error));
$("uploadImage")?.addEventListener("click", () => uploadImageToR2().catch(console.error));
$("autofill")?.addEventListener("click", () => runBookAutofill());

loadPublished().catch(console.error);
setOutput(`Editor loaded.\nAPI: ${WORKER_BASE}`);
