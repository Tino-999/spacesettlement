// assets/js/editor.js

const output = document.getElementById("output");
const publishedEl = document.getElementById("published");

const WORKER_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";

const ITEMS_URL = `${WORKER_BASE}/items`;
const BOOK_SUGGEST_URL = `${WORKER_BASE}/books/suggest?q=`;
const BOOK_AUTOFILL_URL = `${WORKER_BASE}/books/autofill`;

let latestBookSuggestions = [];
let lastQuery = "";

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
  output.textContent =
    typeof o === "string" ? o : JSON.stringify(o, null, 2);
}

// -------------------------
// BOOK SUGGESTIONS
// -------------------------
async function fetchBookSuggestions(q) {
  const res = await fetch(`${BOOK_SUGGEST_URL}${encodeURIComponent(q)}`);
  const data = await res.json();
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

// -------------------------
// BOOK AUTOFILL
// -------------------------
async function autofillBook(openLibraryId) {
  const res = await fetch(BOOK_AUTOFILL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openLibraryId }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error("Autofill failed");

  // Fill fields
  setValue("authors", data.authors);
  setValue("publishedYear", data.publishedYear);
  setValue("publisher", data.publisher);
  setValue("isbn", data.isbn);
  setValue("language", data.language);

  setOutput({
    source: "books/autofill",
    filled: {
      authors: data.authors,
      publishedYear: data.publishedYear,
      publisher: data.publisher,
      isbn: data.isbn,
      language: data.language,
    },
  });
}

// -------------------------
// TITLE INPUT → SUGGEST
// -------------------------
$("title")?.addEventListener("input", async () => {
  if (getValue("type") !== "books") return;

  const q = getValue("title");
  const list = $("titleSuggestions");
  list.innerHTML = "";

  if (q.length < 2 || q === lastQuery) return;
  lastQuery = q;

  latestBookSuggestions = await fetchBookSuggestions(q);

  latestBookSuggestions.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.title;
    list.appendChild(opt);
  });
});

// -------------------------
// TITLE CHANGE → AUTOFILL
// -------------------------
$("title")?.addEventListener("change", async () => {
  if (getValue("type") !== "books") return;

  const title = getValue("title");
  const match = latestBookSuggestions.find(
    (s) => s.title.toLowerCase() === title.toLowerCase()
  );

  if (!match) return;

  if (match.exists) {
    setOutput("Buch existiert bereits in der Datenbank.");
    return;
  }

  try {
    await autofillBook(match.openLibraryId);
  } catch (e) {
    setOutput("Autofill Fehler: " + e.message);
  }
});

// -------------------------
// TYPE VISIBILITY
// -------------------------
$("type")?.addEventListener("change", () => {
  $("bookFields").style.display =
    getValue("type") === "books" ? "block" : "none";
});

// Initial
$("bookFields").style.display =
  getValue("type") === "books" ? "block" : "none";
