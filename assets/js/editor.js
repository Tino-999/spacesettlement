// assets/js/editor.js

const output = document.getElementById("output");
const publishedEl = document.getElementById("published");

const DEFAULT_WORKER_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";

// You can override the API base via:
//   - URL param:  ?api=https://YOUR-WORKER.workers.dev
//   - or it will reuse the last value saved in localStorage
const WORKER_BASE = (() => {
  const qs = new URLSearchParams(location.search);
  const fromUrl = (qs.get("api") || "").trim();
  if (fromUrl) {
    const cleaned = fromUrl.replace(/\/+$/, "");
    localStorage.setItem("WORKER_BASE", cleaned);
    return cleaned;
  }
  const fromStorage = (localStorage.getItem("WORKER_BASE") || "").trim();
  return (fromStorage || DEFAULT_WORKER_BASE).replace(/\/+$/, "");
})();

const UPLOAD_URL = `${WORKER_BASE}/upload-image`;
const ITEMS_URL = `${WORKER_BASE}/items`;

const BOOK_SUGGEST_URL = `${WORKER_BASE}/books/suggest?q=`;
const BOOK_AUTOFILL_URL = `${WORKER_BASE}/books/autofill`;
const BOOK_ENRICH_URL = `${WORKER_BASE}/books/enrich`;

const PEOPLE_SUGGEST_URL = `${WORKER_BASE}/people/suggest?q=`;
const PEOPLE_AUTOFILL_URL = `${WORKER_BASE}/people/autofill`;
const PEOPLE_ENRICH_URL = `${WORKER_BASE}/people/enrich`;

let latestBookSuggestions = [];
let latestPersonSuggestions = [];
let lastBookFacts = null;
let lastPersonFacts = null;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setOutput(html) {
  if (!output) return;
  output.textContent = "";
  output.innerHTML = `<pre style="white-space:pre-wrap; margin:0;">${escapeHtml(
    html
  )}</pre>`;
}

function getValue(id) {
  const el = $(id);
  if (!el) return "";
  return (el.value || "").toString().trim();
}

function setValue(id, value) {
  const el = $(id);
  if (!el) return;
  if (Array.isArray(value)) el.value = value.join(", ");
  else el.value = value == null ? "" : String(value);
}

function isBookType() {
  const t = String(getValue("type") || "").toLowerCase();
  return t === "book" || t === "books";
}

function isPersonType() {
  const t = String(getValue("type") || "").toLowerCase();
  return t === "person" || t === "people";
}

function adminToken() {
  return getValue("adminToken");
}

function buildItem() {
  const item = {
    type: getValue("type"),
    title: getValue("title"),
    href: getValue("href"),
    imageUrl: getValue("imageUrl"),
    summary: getValue("summary"),
    tags: (getValue("tags") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    meta: null,
  };

  // Meta (book + person fields are optional in DOM)
  const meta = {};

  // Person fields
  if ($("birthYear")) {
    const v = getValue("birthYear");
    if (v) meta.birthYear = Number(v) || v;
  }
  if ($("deathYear")) {
    const v = getValue("deathYear");
    if (v) meta.deathYear = Number(v) || v;
  }
  if ($("activeStart")) {
    const v = getValue("activeStart");
    if (v) meta.startYear = Number(v) || v;
  }
  if ($("activeEnd")) {
    const v = getValue("activeEnd");
    if (v) meta.endYear = Number(v) || v;
  }
  if ($("nationalities")) {
    const v = getValue("nationalities");
    if (v)
      meta.nationalities = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
  if ($("affiliations")) {
    const v = getValue("affiliations");
    if (v)
      meta.affiliations = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
  if ($("fields")) {
    const v = getValue("fields");
    if (v)
      meta.fields = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
  if ($("roles")) {
    const v = getValue("roles");
    if (v)
      meta.roles = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }

  // Book fields
  if ($("authors")) {
    const authors = getValue("authors");
    if (authors)
      meta.authors = authors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
  if ($("publishedYear")) {
    const y = getValue("publishedYear");
    if (y) meta.publishedYear = Number(y) || y;
  }
  if ($("publisher")) {
    const publisher = getValue("publisher");
    if (publisher) meta.publisher = publisher;
  }
  if ($("isbn")) {
    const isbn = getValue("isbn");
    if (isbn) meta.isbn = isbn;
  }
  if ($("language")) {
    const language = getValue("language");
    if (language) meta.language = language;
  }

  // Carry autofill facts
  if (lastBookFacts?.openLibraryId) meta.openLibraryId = lastBookFacts.openLibraryId;
  if (lastBookFacts?.wikipediaUrl) meta.wikipediaUrl = lastBookFacts.wikipediaUrl;

  if (lastPersonFacts?.wikipediaUrl) meta.wikipediaUrl = lastPersonFacts.wikipediaUrl;

  item.meta = Object.keys(meta).length ? meta : null;

  return item;
}

// -------------------------
// Upload image (R2 via Worker)
// -------------------------
async function uploadImageToR2() {
  const fileInput = $("imageFile");
  const urlInput = $("imageUrl");

  if (!fileInput) return setOutput('Fehler: <input id="imageFile"> nicht gefunden.');
  if (!urlInput) return setOutput('Fehler: <input id="imageUrl"> nicht gefunden.');

  const file = fileInput.files?.[0];
  if (!file) {
    setOutput("Kein Bild ausgewählt.");
    return;
  }

  const token = adminToken();
  if (!token) {
    setOutput("Bitte Admin Token eintragen (x-admin-token).");
    return;
  }

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { "x-admin-token": token },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    setOutput("Upload Fehler: " + (data.error || res.status));
    return;
  }

  urlInput.value = data.imageUrl || "";
  setOutput("Upload OK:\n" + (data.imageUrl || ""));
}

// -------------------------
// Publish: POST /items (ADMIN)
// -------------------------
async function publishItem() {
  const token = adminToken();
  if (!token) {
    setOutput("Bitte Admin Token eintragen (x-admin-token).");
    return;
  }

  const item = buildItem();
  if (!item.type || !item.title) {
    setOutput("Bitte mindestens Type und Title ausfüllen.");
    return;
  }

  const res = await fetch(ITEMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(item),
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    setOutput("Publish Fehler: " + (data.error || res.status));
    return;
  }

  setOutput("Published ✅\nID: " + data.id + "\nType: " + data.type + "\nSortYear: " + data.sortYear);
  await loadPublished();
}

// -------------------------
// Load published items + delete
// -------------------------
async function loadPublished() {
  if (!publishedEl) return;

  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const parsed = await res.json().catch(() => ({}));

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) {
    publishedEl.textContent = "No published items yet.";
    return;
  }

  publishedEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${items
        .map((it) => {
          const title = escapeHtml(it.title || "");
          const type = escapeHtml(it.type || "");
          const createdAt = escapeHtml(it.createdAt || "");
          const id = escapeHtml(it.id || "");

          return `
            <div style="display:flex; align-items:center; gap:10px; justify-content:space-between; border:1px solid rgba(255,255,255,0.08); padding:10px; border-radius:14px;">
              <div style="min-width:0;">
                <div style="opacity:0.7; font-size:12px;">${type} · ${createdAt}</div>
                <div style="font-weight:700; letter-spacing:0.04em;">${title}</div>
                <div style="opacity:0.6; font-size:12px; word-break:break-all;">${id}</div>
              </div>
              <div style="display:flex; gap:8px; flex-shrink:0;">
                <button class="btn btn--ghost" data-load='${escapeHtml(
                  JSON.stringify(it)
                ).replace(/'/g, "&#039;")}'>Load</button>
                <button class="btn" data-del-id="${id}">Delete</button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  // bind buttons
  publishedEl.querySelectorAll("[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-id");
      const token = adminToken();
      if (!token) return setOutput("Bitte Admin Token eintragen (x-admin-token).");

      const res = await fetch(`${ITEMS_URL}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": token },
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) return setOutput("Delete Fehler: " + (data.error || res.status));

      setOutput("Deleted ✅\n" + id);
      await loadPublished();
    });
  });

  publishedEl.querySelectorAll("[data-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-load") || "{}";
      let it = {};
      try {
        it = JSON.parse(raw);
      } catch {
        it = {};
      }

      // fill base fields
      setValue("type", it.type || "");
      setValue("title", it.title || "");
      setValue("href", it.href || "");
      setValue("imageUrl", it.imageUrl || "");
      setValue("summary", it.summary || "");
      setValue("tags", Array.isArray(it.tags) ? it.tags.join(", ") : "");

      // fill meta
      const meta = it.meta && typeof it.meta === "object" ? it.meta : {};
      if ($("authors")) setValue("authors", Array.isArray(meta.authors) ? meta.authors.join(", ") : "");
      if ($("publishedYear")) setValue("publishedYear", meta.publishedYear ?? "");
      if ($("publisher")) setValue("publisher", meta.publisher ?? "");
      if ($("isbn")) setValue("isbn", meta.isbn ?? "");
      if ($("language")) setValue("language", meta.language ?? "");

      if ($("birthYear")) setValue("birthYear", meta.birthYear ?? "");
      if ($("deathYear")) setValue("deathYear", meta.deathYear ?? "");
      if ($("activeStart")) setValue("activeStart", meta.startYear ?? "");
      if ($("activeEnd")) setValue("activeEnd", meta.endYear ?? "");
      if ($("nationalities")) setValue("nationalities", Array.isArray(meta.nationalities) ? meta.nationalities.join(", ") : "");
      if ($("affiliations")) setValue("affiliations", Array.isArray(meta.affiliations) ? meta.affiliations.join(", ") : "");
      if ($("fields")) setValue("fields", Array.isArray(meta.fields) ? meta.fields.join(", ") : "");
      if ($("roles")) setValue("roles", Array.isArray(meta.roles) ? meta.roles.join(", ") : "");

      // toggle panels
      const pf = $("personFields");
      if (pf) pf.style.display = isPersonType() ? "block" : "none";
      const bf = $("bookFields");
      if (bf) bf.style.display = isBookType() ? "block" : "none";

      setOutput(buildItem());
    });
  });
}

// -------------------------
// Books: suggest + autofill + enrich + wikipedia href
// -------------------------
async function fetchBookSuggestions(q) {
  const res = await fetch(`${BOOK_SUGGEST_URL}${encodeURIComponent(q)}`, { cache: "no-store" });
  const data = await res.json();
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

async function booksAutofillFacts(openLibraryId) {
  const res = await fetch(BOOK_AUTOFILL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openLibraryId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "books_autofill_failed");

  if ($("authors")) setValue("authors", data.authors || []);
  if ($("publishedYear")) setValue("publishedYear", data.publishedYear ?? "");
  if ($("publisher")) setValue("publisher", data.publisher || "");
  if ($("isbn")) setValue("isbn", data.isbn || "");
  if ($("language")) setValue("language", data.language || "");

  if (!getValue("href") && data.wikipediaUrl) setValue("href", data.wikipediaUrl);

  lastBookFacts = {
    openLibraryId: data.openLibraryId,
    wikipediaUrl: data.wikipediaUrl || "",
  };

  return data;
}

async function booksEnrichSummaryTags(facts) {
  const res = await fetch(BOOK_ENRICH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facts),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "books_enrich_failed");

  if ($("summary")) setValue("summary", data.summary || "");
  if ($("tags")) setValue("tags", Array.isArray(data.tags) ? data.tags.join(", ") : "");

  return data;
}

// -------------------------
// People: suggest + autofill + enrich
// (Worker endpoints: /people/suggest, /people/autofill, /people/enrich)
// -------------------------
async function fetchPersonSuggestions(q) {
  const res = await fetch(`${PEOPLE_SUGGEST_URL}${encodeURIComponent(q)}`, { cache: "no-store" });
  const data = await res.json();
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

async function peopleAutofillFacts(payload) {
  const res = await fetch(PEOPLE_AUTOFILL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "people_autofill_failed");

  if ($("birthYear")) setValue("birthYear", data.birthYear ?? "");
  if ($("deathYear")) setValue("deathYear", data.deathYear ?? "");

  if ($("nationalities"))
    setValue(
      "nationalities",
      Array.isArray(data.nationalities) ? data.nationalities.join(", ") : ""
    );
  if ($("affiliations"))
    setValue(
      "affiliations",
      Array.isArray(data.affiliations) ? data.affiliations.join(", ") : ""
    );
  if ($("fields"))
    setValue("fields", Array.isArray(data.fields) ? data.fields.join(", ") : "");
  if ($("roles"))
    setValue("roles", Array.isArray(data.roles) ? data.roles.join(", ") : "");

  if (!getValue("href") && data.wikipediaUrl) setValue("href", data.wikipediaUrl);
  if ($("imageUrl") && data.imageUrl) setValue("imageUrl", data.imageUrl);

  if ($("summary") && data.summary && !getValue("summary")) setValue("summary", data.summary);

  lastPersonFacts = {
    wikipediaUrl: data.wikipediaUrl || "",
    wikipediaTitle: data.wikipediaTitle || "",
    wikipediaLang: data.wikipediaLang || "",
    imageUrl: data.imageUrl || "",
    birthYear: data.birthYear ?? null,
    deathYear: data.deathYear ?? null,
  };

  return data;
}

async function peopleEnrichSummaryTags(facts) {
  const res = await fetch(PEOPLE_ENRICH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "people_enrich_failed");

  if ($("summary")) setValue("summary", data.summary || getValue("summary"));
  if ($("tags")) setValue("tags", Array.isArray(data.tags) ? data.tags.join(", ") : "");

  return data;
}

// -------------------------
// Wire UI
// -------------------------

$("uploadBtn")?.addEventListener("click", () => uploadImageToR2().catch(console.error));
$("publishBtn")?.addEventListener("click", () => publishItem().catch(console.error));
$("reloadBtn")?.addEventListener("click", () => loadPublished().catch(console.error));

$("type")?.addEventListener("change", () => {
  const personFields = $("personFields");
  const bookFields = $("bookFields");
  if (personFields) personFields.style.display = isPersonType() ? "block" : "none";
  if (bookFields) bookFields.style.display = isBookType() ? "block" : "none";
});

// Live suggestions (books + people)
$("title")?.addEventListener("input", async () => {
  const q = getValue("title");
  const list = document.getElementById("titleSuggestions");
  if (!list) {
    setOutput('Fehler: <datalist id="titleSuggestions"> fehlt in admin.html.');
    return;
  }

  list.innerHTML = "";
  if (!q || q.length < 2) return;

  try {
    if (isBookType()) {
      latestBookSuggestions = await fetchBookSuggestions(q);
      latestPersonSuggestions = [];
      latestBookSuggestions.slice(0, 10).forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.title;
        list.appendChild(opt);
      });
    } else if (isPersonType()) {
      latestPersonSuggestions = await fetchPersonSuggestions(q);
      latestBookSuggestions = [];
      latestPersonSuggestions.slice(0, 10).forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.title;
        list.appendChild(opt);
      });
    } else {
      latestBookSuggestions = [];
      latestPersonSuggestions = [];
    }
  } catch (e) {
    setOutput("Suggest Fehler:\n" + (e?.message || e));
    latestBookSuggestions = [];
    latestPersonSuggestions = [];
  }
});

// Select title => autofill (+ enrich)
$("title")?.addEventListener("change", async () => {
  const title = getValue("title");

  // BOOKS
  if (isBookType()) {
    const match = latestBookSuggestions.find(
      (s) => String(s.title || "").toLowerCase() === title.toLowerCase()
    );
    if (!match) return;

    if (match.exists) {
      setOutput("Buch existiert bereits in der Datenbank.");
      return;
    }

    try {
      setOutput("Autofill läuft… (facts)");
      const facts = await booksAutofillFacts(match.openLibraryId);

      setOutput("Autofill läuft… (AI summary/tags)");
      await booksEnrichSummaryTags(facts);

      setOutput(buildItem());
    } catch (e) {
      setOutput("Autofill Fehler: " + (e?.message || e));
    }
    return;
  }

  // PEOPLE
  if (isPersonType()) {
    const match = latestPersonSuggestions.find(
      (s) => String(s.title || "").toLowerCase() === title.toLowerCase()
    );
    if (!match) return;

    try {
      setOutput("Person Autofill läuft… (Wikipedia/Wikidata)");
      const facts = await peopleAutofillFacts({
        query: match.title,
        wikipediaUrl: match.wikipediaUrl || "",
        wikipediaTitle: match.wikipediaTitle || "",
        wikipediaLang: match.wikipediaLang || "",
      });

      setOutput("Person Autofill läuft… (AI summary/tags)");
      await peopleEnrichSummaryTags(facts);

      setOutput(buildItem());
    } catch (e) {
      setOutput("Person Autofill Fehler: " + (e?.message || e));
    }
  }
});

// initial
loadPublished().catch(console.error);

const pf = $("personFields");
if (pf) pf.style.display = isPersonType() ? "block" : "none";
const bf = $("bookFields");
if (bf) bf.style.display = isBookType() ? "block" : "none";
