// assets/js/editor.js

const output = document.getElementById("output");
const publishedEl = document.getElementById("published");

const WORKER_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";

const UPLOAD_URL = `${WORKER_BASE}/upload-image`;
const ITEMS_URL = `${WORKER_BASE}/items`;

const BOOK_SUGGEST_URL = `${WORKER_BASE}/books/suggest?q=`;
const BOOK_AUTOFILL_URL = `${WORKER_BASE}/books/autofill`;
const BOOK_ENRICH_URL = `${WORKER_BASE}/books/enrich`;

let latestBookSuggestions = [];
let lastBookQuery = "";
let lastBookFacts = null;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
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

function setOutput(textOrObj) {
  if (!output) return;
  output.textContent =
    typeof textOrObj === "string"
      ? textOrObj
      : JSON.stringify(textOrObj, null, 2);
}

async function safeReadJson(res) {
  const text = await res.text();
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, raw: text };
  }
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  if (typeof tags === "string") {
    const t = tags.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return t.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function parseCommaList(s) {
  const t = String(s ?? "").trim();
  if (!t) return [];
  return t.split(",").map((x) => x.trim()).filter(Boolean);
}

function parseIntOrNull(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function isBookType() {
  const t = getValue("type").toLowerCase();
  return t === "book" || t === "books";
}

function requireAdminToken(actionLabel) {
  const token = prompt(`Admin token (x-admin-token) für ${actionLabel}:`);
  return token && token.trim() ? token.trim() : null;
}

// -------------------------
// Build item payload (with meta)
// -------------------------
function buildItem() {
  const type = getValue("type"); // person, project, org, topic, concept, book, movie
  const tags = parseCommaList(getValue("tags"));

  const item = {
    type,
    title: getValue("title"),
    href: getValue("href"),
    imageUrl: getValue("imageUrl"),
    summary: getValue("summary"),
    tags,
    meta: null,
  };

  // PERSON meta
  if (type === "person") {
    const meta = {};
    const birthYear = parseIntOrNull(getValue("birthYear"));
    const deathYear = parseIntOrNull(getValue("deathYear"));
    if (birthYear != null) meta.birthYear = birthYear;
    if (deathYear != null) meta.deathYear = deathYear;
    item.meta = Object.keys(meta).length ? meta : null;
  }

  // BOOK meta
  if (isBookType()) {
    const meta = {};

    if ($("authors")) {
      const authors = parseCommaList(getValue("authors"));
      if (authors.length) meta.authors = authors;
    }
    if ($("publishedYear")) {
      const y = parseIntOrNull(getValue("publishedYear"));
      if (y != null) meta.publishedYear = y;
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

    if (lastBookFacts?.openLibraryId) meta.openLibraryId = lastBookFacts.openLibraryId;
    if (lastBookFacts?.wikipediaUrl) meta.wikipediaUrl = lastBookFacts.wikipediaUrl;

    item.meta = Object.keys(meta).length ? meta : null;
  }

  return item;
}

// -------------------------
// Upload image (R2 via Worker)
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

    const fd = new FormData();
    fd.append("file", file, file.name);

    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { "x-admin-token": token },
      body: fd,
    });

    const parsed = await safeReadJson(res);
    if (!res.ok) {
      return setOutput(
        `Upload-Fehler (HTTP ${res.status}):\n` +
          (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
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
// Publish (POST /items)
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
      `Publish-Fehler (HTTP ${res.status}):\n` +
        (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
    );
  }

  setOutput({ ok: true, published: parsed.json });
  alert("Item veröffentlicht ✔");

  latestBookSuggestions = [];
  lastBookQuery = "";

  await loadPublished();
}

// -------------------------
// List + Load + Delete
// -------------------------
async function loadPublished() {
  if (!publishedEl) return;

  publishedEl.textContent = `Loading…\nGET ${ITEMS_URL}`;

  let res;
  try {
    res = await fetch(ITEMS_URL, { cache: "no-store" });
  } catch (e) {
    publishedEl.innerHTML =
      `<pre class="code" style="white-space:pre-wrap;">` +
      escapeHtml("Netzwerkfehler (list): Failed to fetch\n" + (e?.message || e)) +
      `</pre>`;
    return;
  }

  const parsed = await safeReadJson(res);
  if (!res.ok) {
    publishedEl.innerHTML =
      `<pre class="code" style="white-space:pre-wrap;">` +
      escapeHtml(
        `List-Fehler (HTTP ${res.status}):\n` +
          (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
      ) +
      `</pre>`;
    return;
  }

  const items = Array.isArray(parsed?.json?.items) ? parsed.json.items : [];
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

  publishedEl.querySelectorAll("button[data-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      try {
        const it = JSON.parse(btn.getAttribute("data-load"));

        setValue("type", it.type);
        setValue("title", it.title);
        setValue("href", it.href);
        setValue("imageUrl", it.imageUrl || "");
        setValue("summary", it.summary);
        setValue("tags", normalizeTags(it.tags));

        if (it.type === "person") {
          setValue("birthYear", it?.meta?.birthYear ?? "");
          setValue("deathYear", it?.meta?.deathYear ?? "");
        } else {
          setValue("birthYear", "");
          setValue("deathYear", "");
        }

        if ((it.type || "").toLowerCase() === "book" || (it.type || "").toLowerCase() === "books") {
          if ($("authors")) setValue("authors", it?.meta?.authors ?? []);
          if ($("publishedYear")) setValue("publishedYear", it?.meta?.publishedYear ?? "");
          if ($("publisher")) setValue("publisher", it?.meta?.publisher ?? "");
          if ($("isbn")) setValue("isbn", it?.meta?.isbn ?? "");
          if ($("language")) setValue("language", it?.meta?.language ?? "");
        } else {
          if ($("authors")) setValue("authors", "");
          if ($("publishedYear")) setValue("publishedYear", "");
          if ($("publisher")) setValue("publisher", "");
          if ($("isbn")) setValue("isbn", "");
          if ($("language")) setValue("language", "");
        }

        setOutput(buildItem());
      } catch (e) {
        console.error(e);
      }
    });
  });

  publishedEl.querySelectorAll("button[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-id");
      if (!id) return;
      if (!confirm("Delete this item?")) return;

      const token = requireAdminToken("Delete");
      if (!token) return alert("Delete abgebrochen (kein Token).");

      let delRes;
      try {
        delRes = await fetch(`${ITEMS_URL}?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-admin-token": token },
        });
      } catch (e) {
        return alert("Delete failed: Failed to fetch\n" + (e?.message || e));
      }

      if (!delRes.ok) {
        const t = await delRes.text();
        return alert("Delete failed: " + t);
      }

      latestBookSuggestions = [];
      lastBookQuery = "";
      await loadPublished();
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
    title: data.title || "",
    authors: Array.isArray(data.authors) ? data.authors : [],
    publishedYear: typeof data.publishedYear === "number" ? data.publishedYear : null,
    publisher: data.publisher || "",
    isbn: data.isbn || "",
    language: data.language || "",
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
  };

  return lastBookFacts;
}

async function booksEnrichSummaryTags(facts) {
  const res = await fetch(BOOK_ENRICH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: facts.title,
      authors: facts.authors,
      publishedYear: facts.publishedYear,
      publisher: facts.publisher,
      isbn: facts.isbn,
      language: facts.language,
      subjects: facts.subjects,
    }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "books_enrich_failed");

  if (data.summary) setValue("summary", data.summary);
  if (Array.isArray(data.tags)) setValue("tags", data.tags);

  return data;
}

// -------------------------
// UI wiring
// -------------------------
$("generate")?.addEventListener("click", () => setOutput(buildItem()));
$("publish")?.addEventListener("click", () => publishItem().catch((e) => setOutput(e?.message || e)));
$("refreshList")?.addEventListener("click", () => loadPublished().catch(console.error));
$("uploadImage")?.addEventListener("click", () => uploadImageToR2().catch(console.error));

$("type")?.addEventListener("change", () => {
  const personFields = $("personFields");
  const bookFields = $("bookFields");

  if (personFields) personFields.style.display = getValue("type") === "person" ? "block" : "none";
  if (bookFields) bookFields.style.display = isBookType() ? "block" : "none";
});

// Books: live suggestions
$("title")?.addEventListener("input", async () => {
  if (!isBookType()) return;

  const q = getValue("title");
  const list = document.getElementById("titleSuggestions");
  if (!list) {
    setOutput('Fehler: <datalist id="titleSuggestions"> fehlt in admin.html.');
    return;
  }

  list.innerHTML = "";
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

  latestBookSuggestions.slice(0, 10).forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.title;
    list.appendChild(opt);
  });
});

// Books: select title => autofill + enrich
$("title")?.addEventListener("change", async () => {
  if (!isBookType()) return;

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
    const facts = await booksAutofillFacts(match.openLibraryId);

    setOutput("Autofill läuft… (AI summary/tags)");
    await booksEnrichSummaryTags(facts);

    setOutput(buildItem());
  } catch (e) {
    setOutput("Autofill Fehler: " + (e?.message || e));
  }
});

// initial
loadPublished().catch(console.error);

const pf = $("personFields");
if (pf) pf.style.display = getValue("type") === "person" ? "block" : "none";
const bf = $("bookFields");
if (bf) bf.style.display = isBookType() ? "block" : "none";
