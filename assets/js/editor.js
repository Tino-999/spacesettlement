// assets/js/editor.js

const output = document.getElementById("output");

const WORKER_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";

const BOOK_SUGGEST_URL = `${WORKER_BASE}/books/suggest?q=`;
const BOOK_AUTOFILL_URL = `${WORKER_BASE}/books/autofill`;
const BOOK_ENRICH_URL = `${WORKER_BASE}/books/enrich`;

let latestBookSuggestions = [];
let lastQuery = "";
let lastAutofillPayload = null;

function $(id) {
  return document.getElementById(id);
}

function getValue(id) {
  return ($(id)?.value ?? "").trim();
}

function setValue(id, value) {
  const el = $(id);
  if (!el) return;
  if (Array.isArray(value)) el.value = value.join(", ");
  else el.value = value ?? "";
}

function setOutput(o) {
  output.textContent = typeof o === "string" ? o : JSON.stringify(o, null, 2);
}

// -------------------------
// BOOK SUGGESTIONS
// -------------------------
async function fetchBookSuggestions(q) {
  const res = await fetch(`${BOOK_SUGGEST_URL}${encodeURIComponent(q)}`, {
    cache: "no-store",
  });
  const data = await res.json();
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

// -------------------------
// BOOK AUTOFILL (facts)
// -------------------------
async function autofillBookFacts(openLibraryId) {
  const res = await fetch(BOOK_AUTOFILL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openLibraryId }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "books_autofill_failed");

  // Fill facts fields
  setValue("authors", data.authors);
  setValue("publishedYear", data.publishedYear);
  setValue("publisher", data.publisher);
  setValue("isbn", data.isbn);
  setValue("language", data.language);

  // NEW: fill href with Wikipedia URL if empty
  const currentHref = getValue("href");
  if (!currentHref && typeof data.wikipediaUrl === "string" && data.wikipediaUrl.trim()) {
    setValue("href", data.wikipediaUrl.trim());
  }

  lastAutofillPayload = {
    title: data.title,
    authors: Array.isArray(data.authors) ? data.authors : [],
    publishedYear: typeof data.publishedYear === "number" ? data.publishedYear : null,
    publisher: data.publisher || "",
    isbn: data.isbn || "",
    language: data.language || "",
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
    wikipediaUrl: typeof data.wikipediaUrl === "string" ? data.wikipediaUrl : "",
  };

  setOutput({
    source: "books/autofill",
    filled: {
      href: getValue("href"),
      authors: data.authors,
      publishedYear: data.publishedYear,
      publisher: data.publisher,
      isbn: data.isbn,
      language: data.language,
    },
    next: "books/enrich",
  });

  return data;
}

// -------------------------
// BOOK ENRICH (AI text)
// -------------------------
async function enrichBookSummaryAndTags(facts) {
  const res = await fetch(BOOK_ENRICH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facts),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "books_enrich_failed");

  if (typeof data.summary === "string" && data.summary.trim()) {
    setValue("summary", data.summary.trim());
  }

  if (Array.isArray(data.tags) && data.tags.length) {
    setValue("tags", data.tags.map(String));
  }

  setOutput({
    source: "books/enrich",
    filled: { summary: data.summary, tags: data.tags },
  });

  return data;
}

// -------------------------
// TITLE INPUT → SUGGEST
// -------------------------
$("title")?.addEventListener("input", async () => {
  if (getValue("type") !== "books") return;

  const q = getValue("title");
  const list = $("titleSuggestions");
  if (!list) return;

  list.innerHTML = "";
  if (q.length < 2) return;

  if (q === lastQuery) return;
  lastQuery = q;

  latestBookSuggestions = await fetchBookSuggestions(q);

  latestBookSuggestions.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.title;
    list.appendChild(opt);
  });
});

// -------------------------
// TITLE CHANGE → AUTOFILL + ENRICH
// -------------------------
$("title")?.addEventListener("change", async () => {
  if (getValue("type") !== "books") return;

  const title = getValue("title");
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
    const factsRes = await autofillBookFacts(match.openLibraryId);

    const facts = lastAutofillPayload || {
      title: factsRes.title,
      authors: factsRes.authors || [],
      publishedYear: factsRes.publishedYear ?? null,
      publisher: factsRes.publisher || "",
      isbn: factsRes.isbn || "",
      language: factsRes.language || "",
      subjects: factsRes.subjects || [],
      wikipediaUrl: factsRes.wikipediaUrl || "",
    };

    setOutput("Autofill läuft… (AI summary/tags)");
    await enrichBookSummaryAndTags(facts);
  } catch (e) {
    setOutput("Autofill Fehler: " + (e?.message || String(e)));
  }
});

// -------------------------
// TYPE VISIBILITY
// -------------------------
$("type")?.addEventListener("change", () => {
  const bookFields = $("bookFields");
  if (bookFields) bookFields.style.display = getValue("type") === "books" ? "block" : "none";
});

// Initial
const bookFields = $("bookFields");
if (bookFields) bookFields.style.display = getValue("type") === "books" ? "block" : "none";
