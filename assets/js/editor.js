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
let TITLE_SUGGEST_URL = "";
let AI_ENRICH_URL = "";

const publishedEl = $("published");

let latestBookSuggestions = [];
let lastBookQuery = "";
let lastBookFacts = null;

// Cache for published items (id -> item)
let publishedCache = new Map();

/* =========================
   Helpers
========================= */

const normalizeType = (t) => {
  const s = String(t || "").trim().toLowerCase();
  if (s === "books") return "book";
  if (s === "people") return "person";
  return s;
};

const parseIntOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
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
  out.textContent =
    typeof objOrText === "string"
      ? objOrText
      : JSON.stringify(objOrText, null, 2);
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
    token = prompt(`${actionLabel}: Bitte Admin Token eingeben`);
    if (token) localStorage.setItem(key, token);
  }
  return token || "";
}

/* =========================
   IMAGE UPLOAD (FIXED)
========================= */

async function uploadImageToR2() {
  // 🔧 FIX: ensure init() ran and UPLOAD_URL is set
  if (!UPLOAD_URL) {
    await init();
  }

  const fileInput = $("imageFile");
  const urlInput = $("imageUrl");
  if (!fileInput) return setOutput('Fehler: <input id="imageFile"> fehlt.');

  const file = fileInput.files?.[0];
  if (!file) return setOutput("Bitte zuerst ein Bild auswählen.");

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
        `Upload Fehler (${res.status}):\n${
          parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw
        }`
      );
    }

    const data = parsed.ok ? parsed.json : null;
    if (!data?.imageUrl)
      return setOutput("Upload ok, aber keine imageUrl erhalten.");

    if (urlInput) urlInput.value = data.imageUrl;
    setOutput({ ok: true, upload: data });
  } catch (e) {
    setOutput("Upload Fehler:\n" + (e?.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =========================
   INIT
========================= */

async function loadApiBase() {
  const params = new URLSearchParams(location.search);
  const apiParam = params.get("api");
  if (apiParam) return apiParam.replace(/\/+$/, "");

  try {
    const res = await fetch("data/config.json", { cache: "no-store" });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg?.apiBase) return cfg.apiBase.replace(/\/+$/, "");
    }
  } catch (_) {}

  return "https://spacesettlement-api-staging.tinoschuldt100.workers.dev";
}

async function init() {
  if (WORKER_BASE) return; // 🔒 prevent double init

  DEFAULT_WORKER_BASE = await loadApiBase();
  WORKER_BASE = DEFAULT_WORKER_BASE;

  ITEMS_URL = `${WORKER_BASE}/items`;
  UPLOAD_URL = `${WORKER_BASE}/upload-image`;
  BOOK_SUGGEST_URL = `${WORKER_BASE}/books/suggest`;
  BOOK_AUTOFILL_URL = `${WORKER_BASE}/books/autofill`;
  BOOK_ENRICH_URL = `${WORKER_BASE}/books/enrich`;
  TITLE_SUGGEST_URL = `${WORKER_BASE}/suggest-title`;
  AI_ENRICH_URL = `${WORKER_BASE}/ai/enrich`;
}

/* =========================
   EVENT WIRING
========================= */

$("uploadImage")?.addEventListener("click", (e) => {
  e.preventDefault();
  uploadImageToR2().catch(console.error);
});

document.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => setOutput(String(e?.message || e)));
});
