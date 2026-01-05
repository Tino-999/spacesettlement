// editor.js
// Usage: admin.html?api=https://<your-worker>.workers.dev

const $ = (id) => document.getElementById(id);

let WORKER_BASE = "";
let ITEMS_URL = "";
let UPLOAD_URL = "";
let TITLE_SUGGEST_URL = "";
let AI_ENRICH_URL = "";
let I18N_ADMIN_URL = "";
let I18N_PUBLISH_URL = "";
let I18N_TRANSLATE_EN_URL = "";

let SELECTED_ID = null;

const LS_TOKEN_KEY = "spacesettlement_admin_token";

function setOutput(objOrText) {
  const out = $("output");
  if (!out) return;
  out.textContent =
    typeof objOrText === "string" ? objOrText : JSON.stringify(objOrText, null, 2);
}

function parseIntOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function splitTags(s) {
  return String(s || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function requireAdminToken(purpose) {
  let token = (localStorage.getItem(LS_TOKEN_KEY) || "").trim();
  if (token) return token;

  token = prompt(`Admin token required for: ${purpose}\n\nPaste token:`) || "";
  token = token.trim();
  if (token) localStorage.setItem(LS_TOKEN_KEY, token);
  return token;
}

async function loadApiBase() {
  const params = new URLSearchParams(location.search);
  const apiParam = (params.get("api") || "").trim();
  if (apiParam) return apiParam.replace(/\/$/, "");

  // Optional fallback: data/config.json -> { "apiBase": "https://spacesettlement-api-staging.tinoschuldt100.workers.dev" }
  try {
    const r = await fetch("data/config.json", { cache: "no-store" });
    if (r.ok) {
      const cfg = await r.json();
      const base = String(cfg?.apiBase || "").trim();
      if (base) return base.replace(/\/$/, "");
    }
  } catch (_) {}

  return "";
}

async function init() {
  WORKER_BASE = await loadApiBase();
  if (!WORKER_BASE) {
    setOutput(
      "Missing API base.\nOpen as: admin.html?api=https://<your-worker>.workers.dev"
    );
    return;
  }

  ITEMS_URL = `${WORKER_BASE}/items`;
  UPLOAD_URL = `${WORKER_BASE}/upload-image`;
  TITLE_SUGGEST_URL = `${WORKER_BASE}/suggest-title`;
  AI_ENRICH_URL = `${WORKER_BASE}/ai/enrich`;
  I18N_ADMIN_URL = `${WORKER_BASE}/admin/i18n`;
  I18N_PUBLISH_URL = `${WORKER_BASE}/admin/i18n/publish`;
  I18N_TRANSLATE_EN_URL = `${WORKER_BASE}/admin/i18n/translate/en`;

  await refreshPublishedList();
}

/* =========================
   IMAGE UPLOAD
========================= */
async function uploadImage() {
  if (!UPLOAD_URL) await init();

  const fileInput = $("imageFile");
  const urlInput = $("imageUrl");
  if (!fileInput) return setOutput('Error: missing <input id="imageFile">');

  const file = fileInput.files?.[0];
  if (!file) return setOutput("Please select an image file first.");

  const token = requireAdminToken("Upload image");
  if (!token) return setOutput("Upload cancelled (no token).");

  const btn = $("uploadImage");
  if (btn) btn.disabled = true;

  try {
    const form = new FormData();
    form.append("file", file, file.name);

    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { "x-admin-token": token },
      body: form,
    });

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      return setOutput(
        `Upload failed (${res.status}).\n` +
          (data?.error ? data.error : text.slice(0, 400))
      );
    }

    if (!data?.imageUrl) return setOutput("Upload OK but no imageUrl returned.");

    if (urlInput) urlInput.value = data.imageUrl;

    // Preview if available
    const preview = $("imagePreview");
    if (preview) preview.src = data.imageUrl;

    setOutput({ ok: true, upload: data });
  } catch (e) {
    setOutput("Upload error:\n" + (e?.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =========================
   TITLE AUTOCOMPLETE
========================= */

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function fetchTitleSuggestions(q) {
  if (!q || q.trim().length < 2) return [];
  if (!TITLE_SUGGEST_URL) await init();

  const u = new URL(TITLE_SUGGEST_URL);
  u.searchParams.set("q", q.trim());
  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

function renderTitleSuggestions(list) {
  const box = $("titleSuggestions");
  if (!box) return;

  if (!list || !list.length) {
    box.innerHTML = "";
    return;
  }

  // Render as click targets
  box.innerHTML = list
    .slice(0, 12)
    .map((s, idx) => {
      const t = String(s.title || "");
      const href = s.href ? String(s.href) : "";
      const src = s.source ? String(s.source) : "unknown";
      const safeT = t.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeSrc = src.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<div style="display:flex; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.08);">
        <button class="btn btn--ghost" type="button" data-sidx="${idx}" style="padding:6px 10px;">${safeT}</button>
        <span style="opacity:.75; font-size:12px;">${safeSrc}</span>
        ${
          href
            ? `<span style="opacity:.65; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${href}</span>`
            : ""
        }
      </div>`;
    })
    .join("");

  // Attach click behavior
  box.querySelectorAll("button[data-sidx]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const i = parseInt(btn.getAttribute("data-sidx"), 10);
      const s = list[i];
      if (!s) return;

      if ($("title")) $("title").value = String(s.title || "").trim();

      // If suggestion has href, set it immediately.
      if (s.href && $("href")) $("href").value = String(s.href).trim();

      renderTitleSuggestions([]);

      // Auto-enrich to fill external link (wiki priority), summary, tags.
      await aiEnrich();
    });
  });
}

const onTitleInput = debounce(async () => {
  try {
    const q = ($("title")?.value || "").trim();
    if (!q || q.length < 2) return renderTitleSuggestions([]);
    const list = await fetchTitleSuggestions(q);
    console.log("[editor] suggest-title:", q);
    renderTitleSuggestions(list);
  } catch (e) {
    console.error("[editor] suggest failed", e);
  }
}, 250);

/* =========================
   AI ENRICH (Link + Summary + Tags)
========================= */

async function aiEnrich() {
  if (!AI_ENRICH_URL) await init();

  const title = ($("title")?.value || "").trim();
  const type = ($("type")?.value || "").trim();
  if (!title) return setOutput("Missing title.");
  if (!type) return setOutput("Missing type.");

  const token = requireAdminToken("AI enrich");
  if (!token) return setOutput("AI enrich cancelled (no token).");

  const btn = $("aiEnrich");
  if (btn) btn.disabled = true;

  try {
    const r = await fetch(AI_ENRICH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify({ title, type }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return setOutput(`AI enrich failed (${r.status}).\n${data?.error || ""}`);
    }

    // External link: server already prefers wikipediaUrl if available.
    if ($("href") && data?.href) $("href").value = String(data.href).trim();

    // Summary
    if ($("summary") && data?.summary) $("summary").value = String(data.summary);

    // Tags
    if ($("tags") && Array.isArray(data?.tags)) $("tags").value = data.tags.join(", ");

    setOutput({ ok: true, enrich: data });
  } catch (e) {
    setOutput("AI enrich error:\n" + (e?.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =========================
   CREATE / UPDATE / DELETE
========================= */

function readForm() {
  const type = ($("type")?.value || "").trim();
  const title = ($("title")?.value || "").trim();
  const budget = ($("budgetBillionUSD")?.value || "").trim();

  const payload = {
    type,
    title,
    href: ($("href")?.value || "").trim(),
    imageUrl: ($("imageUrl")?.value || "").trim(),
    summary: ($("summary")?.value || "").trim(),
    tags: splitTags($("tags")?.value || ""),
    project_class: ($("projectClass")?.value || "").trim() || null,
    fiction_class: ($("fictionClass")?.value || "").trim() || null,
    startYear: parseIntOrNull($("startYear")?.value),
    endYear: parseIntOrNull($("endYear")?.value),
    sortYear: parseIntOrNull($("sortYear")?.value),
    meta: null, // keep minimal; extend as needed
    budgetBillionUSD: budget === "" ? null : Number(budget),

  };

  return payload;
}

async function createItem() {
  if (!ITEMS_URL) await init();

  const token = requireAdminToken("Create item");
  if (!token) return setOutput("Create cancelled (no token).");

  const payload = readForm();
  if (!payload.type) return setOutput("Missing type.");
  if (!payload.title) return setOutput("Missing title.");

  const r = await fetch(ITEMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) return setOutput(`Create failed (${r.status}).\n${data?.error || ""}`);

  setOutput({ ok: true, created: data });
  await refreshPublishedList();
}

async function updateItem(id) {
  if (!ITEMS_URL) await init();

  const token = requireAdminToken("Update item");
  if (!token) return setOutput("Update cancelled (no token).");

  const payload = readForm();

  const u = new URL(ITEMS_URL);
  u.searchParams.set("id", id);

  const r = await fetch(u.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) return setOutput(`Update failed (${r.status}).\n${data?.error || ""}`);

  setOutput({ ok: true, updated: data });
  await refreshPublishedList();
}

async function deleteItem(id) {
  if (!ITEMS_URL) await init();

  const token = requireAdminToken("Delete item");
  if (!token) return setOutput("Delete cancelled (no token).");

  const u = new URL(ITEMS_URL);
  u.searchParams.set("id", id);

  const r = await fetch(u.toString(), {
    method: "DELETE",
    headers: { "x-admin-token": token },
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) return setOutput(`Delete failed (${r.status}).\n${data?.error || ""}`);

  setOutput({ ok: true, deleted: data });
  await refreshPublishedList();
}

/* =========================
   PUBLISHED LIST (RIGHT PANEL)
========================= */

function renderPublished(items) {
  const box = $("published");
  if (!box) return;

  if (!items || !items.length) {
    box.innerHTML = "<div style='opacity:.8'>No items.</div>";
    return;
  }

  box.innerHTML = items
    .map((it) => {
      const t = String(it.title || "");
      const id = String(it.id || "");
      const ty = String(it.type || "");
      const safeT = t.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<div style="display:flex; gap:10px; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.08);">
        <div style="min-width:72px; opacity:.75; font-size:12px;">${ty}</div>
        <button class="btn btn--ghost" type="button" data-edit="${id}" style="padding:6px 10px; text-align:left; flex:1;">${safeT}</button>
        <button class="btn btn--ghost" type="button" data-del="${id}" style="padding:6px 10px;">Delete</button>
      </div>`;
    })
    .join("");

  box.querySelectorAll("button[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-edit");
      const it = items.find((x) => String(x.id) === String(id));
      if (!it) return;
      fillForm(it);
      loadI18nForEntry(it.id).catch(console.error);
      setOutput({ selected: it.id });
    });
  });

  box.querySelectorAll("button[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-del");
      if (!id) return;
      if (!confirm("Delete this item?")) return;
      await deleteItem(id);
    });
  });
}

function fillForm(it) {
  SELECTED_ID = it?.id || null;
  if ($("type")) $("type").value = it.type || "";
  if ($("title")) $("title").value = it.title || "";
  if ($("href")) $("href").value = it.href || "";
  if ($("imageUrl")) $("imageUrl").value = it.imageUrl || "";
  if ($("summary")) $("summary").value = it.summary || "";
  if ($("tags")) $("tags").value = Array.isArray(it.tags) ? it.tags.join(", ") : "";

  if ($("projectClass")) $("projectClass").value = it.project_class || "";
  if ($("fictionClass")) $("fictionClass").value = it.fiction_class || "";

  if ($("startYear")) $("startYear").value = it.startYear ?? "";
  if ($("endYear")) $("endYear").value = it.endYear ?? "";
  if ($("sortYear")) $("sortYear").value = it.sortYear ?? "";

  // Preview image
  const preview = $("imagePreview");
  if (preview) preview.src = it.imageUrl || "";
}


async function loadI18nForEntry(entryId) {
  const statusBox = $("i18nStatus");
  const deTitlePub = $("de_title_published");
  const deSummaryPub = $("de_summary_published");
  const enTitleDraft = $("en_title_draft");
  const enSummaryDraft = $("en_summary_draft");
  const enTitlePub = $("en_title_published");
  const enSummaryPub = $("en_summary_published");

  if (statusBox) statusBox.innerHTML = "";

  if (!I18N_ADMIN_URL || !entryId) return;

  const token = requireAdminToken("load i18n");
  const u = new URL(I18N_ADMIN_URL);
  u.searchParams.set("entry_id", entryId);

  const r = await fetch(u.toString(), {
    headers: { "x-admin-token": token },
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const by = {};
  for (const row of rows) {
    const k = String(row.key || "");
    const lang = String(row.lang || "");
    by[`${k}::${lang}`] = row;
  }

  const titleKey = `item.${entryId}.title`;
  const summaryKey = `item.${entryId}.summary`;

  const deTitle = by[`${titleKey}::de`];
  const deSummary = by[`${summaryKey}::de`];
  const enTitle = by[`${titleKey}::en`];
  const enSummary = by[`${summaryKey}::en`];

  if (deTitlePub) deTitlePub.value = (deTitle?.published || "").trim();
  if (deSummaryPub) deSummaryPub.value = (deSummary?.published || "").trim();

  if (enTitleDraft) enTitleDraft.value = (enTitle?.draft || "").trim();
  if (enSummaryDraft) enSummaryDraft.value = (enSummary?.draft || "").trim();

  if (enTitlePub) enTitlePub.value = (enTitle?.published || "").trim();
  if (enSummaryPub) enSummaryPub.value = (enSummary?.published || "").trim();

  // badges
  if (statusBox) {
    const mk = (txt, cls="") => `<span class="admin-badge ${cls}">${txt.replace(/</g,"&lt;")}</span>`;
    const deState = (deTitle?.published && deSummary?.published) ? "DE: published" : "DE: missing";
    const enState =
      (enTitle?.published && enSummary?.published) ? "EN: published" :
      (enTitle?.draft || enSummary?.draft) ? "EN: draft" :
      "EN: missing";
    statusBox.innerHTML = mk(deState, "admin-badge--ok") + mk(enState, enState.includes("missing") ? "admin-badge--warn" : "admin-badge--ok");
  }
}

async function publishDeForEntry(entryId) {
  if (!entryId) return;
  if (!I18N_PUBLISH_URL) return;

  const token = requireAdminToken("publish DE");
  const titleKey = `item.${entryId}.title`;
  const summaryKey = `item.${entryId}.summary`;

  // Update drafts from current form fields first
  await upsertI18nDraft(titleKey, "de", entryId, "title", ($("title")?.value || "").trim());
  await upsertI18nDraft(summaryKey, "de", entryId, "summary", ($("summary")?.value || "").trim());

  await publishKey(titleKey, "de", token);
  await publishKey(summaryKey, "de", token);

  await loadI18nForEntry(entryId);
}

async function translateEnForEntry(entryId) {
  if (!entryId) return;
  const token = requireAdminToken("translate EN");
  const titleKey = `item.${entryId}.title`;
  const summaryKey = `item.${entryId}.summary`;

  await translateKeyToEn(titleKey, token);
  await translateKeyToEn(summaryKey, token);

  await loadI18nForEntry(entryId);
}

async function publishEnForEntry(entryId) {
  if (!entryId) return;
  const token = requireAdminToken("publish EN");
  const titleKey = `item.${entryId}.title`;
  const summaryKey = `item.${entryId}.summary`;

  // Upsert EN drafts from UI first (optional manual edits)
  await upsertI18nDraft(titleKey, "en", entryId, "title", ($("en_title_draft")?.value || "").trim());
  await upsertI18nDraft(summaryKey, "en", entryId, "summary", ($("en_summary_draft")?.value || "").trim());

  await publishKey(titleKey, "en", token);
  await publishKey(summaryKey, "en", token);

  await loadI18nForEntry(entryId);
}

async function upsertI18nDraft(key, lang, entry_id, field, draft) {
  if (!I18N_ADMIN_URL) return;
  const token = requireAdminToken(`upsert i18n ${lang}`);
  await fetch(I18N_ADMIN_URL, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify({ key, lang, entry_id, field, draft }),
  });
}

async function publishKey(key, lang, token) {
  await fetch(I18N_PUBLISH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify({ key, lang }),
  });
}

async function translateKeyToEn(key, token) {
  await fetch(I18N_TRANSLATE_EN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify({ key }),
  });
}

async function refreshPublishedList() {
  if (!ITEMS_URL) return;

  const type = ($("type")?.value || "").trim();
  const u = new URL(ITEMS_URL);
  if (type) u.searchParams.set("type", type);

  const r = await fetch(u.toString(), { cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  const items = Array.isArray(data?.items) ? data.items : [];
  renderPublished(items);
}

/* =========================
   JSON GENERATION (optional)
========================= */
function generateJson() {
  const payload = readForm();
  setOutput(payload);
}

/* =========================
   EVENT WIRING
========================= */

document.addEventListener("DOMContentLoaded", () => {
  console.log("[editor] DOM ready");

  init().catch((err) => {
    console.error("[editor] init failed", err);
  });

  // Title autocomplete
  const titleInput = $("title");
  if (titleInput) {
    titleInput.addEventListener("input", onTitleInput);
  } else {
    console.error("[editor] title input not found");
  }

  // Buttons
  const uploadBtn = $("uploadImage");
  if (uploadBtn) uploadBtn.addEventListener("click", uploadImage);

  const enrichBtn = $("aiEnrich");
  if (enrichBtn) enrichBtn.addEventListener("click", aiEnrich);

  const genBtn = $("generate");
  if (genBtn) genBtn.addEventListener("click", generateJson);

  const pubDeBtn = $("publishDe");
  if (pubDeBtn) pubDeBtn.addEventListener("click", async () => {
    if (!SELECTED_ID) return alert("Select an item first.");
    await publishDeForEntry(SELECTED_ID);
  });

  const trEnBtn = $("translateEn");
  if (trEnBtn) trEnBtn.addEventListener("click", async () => {
    if (!SELECTED_ID) return alert("Select an item first.");
    await translateEnForEntry(SELECTED_ID);
  });

  const pubEnBtn = $("publishEn");
  if (pubEnBtn) pubEnBtn.addEventListener("click", async () => {
    if (!SELECTED_ID) return alert("Select an item first.");
    await publishEnForEntry(SELECTED_ID);
  });

  const refreshBtn = $("refreshList");
  if (refreshBtn) refreshBtn.addEventListener("click", refreshPublishedList);

  // "OK / Publish" = create when nothing selected, otherwise update selected
  const publishBtn = $("publish");
  if (publishBtn) {
    publishBtn.addEventListener("click", async () => {
      if (SELECTED_ID) return updateItem(SELECTED_ID);
      return createItem();
    });
  }
});
