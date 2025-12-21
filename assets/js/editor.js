// assets/js/editor.js

const output = document.getElementById("output");
const publishedEl = document.getElementById("published");

// Cloudflare Worker API base
const WORKER_BASE =
  "https://damp-sun-7c39spacesettlement-api.tinoschuldt100.workers.dev";

// Endpoints
const UPLOAD_URL = `${WORKER_BASE}/upload-image`;
const ITEMS_URL = `${WORKER_BASE}/items`;

// Autofill bleibt vorerst auf Netlify
const AUTOFILL_URL = "/.netlify/functions/autofill";

function $(id) {
  return document.getElementById(id);
}

function getValue(id) {
  return ($(id)?.value ?? "").trim();
}

function setValue(id, value) {
  const el = $(id);
  if (!el || value == null) return;

  if (Array.isArray(value)) el.value = value.join(", ");
  else el.value = String(value);
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

function setOutput(text) {
  if (output) output.textContent = String(text ?? "");
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
    // JSON string from D1?
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    // fallback: comma separated
    return t.split(",").map((x) => x.trim()).filter(Boolean);
  }

  return [];
}

function parseCommaList(s) {
  const t = String(s ?? "").trim();
  if (!t) return [];
  return t
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseIntOrNull(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function buildItem() {
  const tags = parseCommaList(getValue("tags"));

  const item = {
    type: getValue("type"),
    title: getValue("title"),
    href: getValue("href"),
    imageUrl: getValue("imageUrl"),
    summary: getValue("summary"),
    tags,
    meta: null,
  };

  // NEW: people specific fields go into meta
  if (item.type === "people") {
    const birthYear = parseIntOrNull(getValue("birthYear"));
    const deathYear = parseIntOrNull(getValue("deathYear"));

    const meta = {};

    if (birthYear != null) meta.birthYear = birthYear;
    if (deathYear != null) meta.deathYear = deathYear;

    // Optional future fields (only if the corresponding inputs exist in admin.html)
    // nationality, affiliations etc. can be added later without breaking anything.
    // If inputs are not present, these will stay empty.
    const nat = $("nationality") ? parseCommaList(getValue("nationality")) : [];
    const aff = $("affiliations") ? parseCommaList(getValue("affiliations")) : [];
    const fields = $("fields") ? parseCommaList(getValue("fields")) : [];
    const roles = $("roles") ? parseCommaList(getValue("roles")) : [];
    const activeStartYear = $("activeStartYear") ? parseIntOrNull(getValue("activeStartYear")) : null;
    const activeEndYear = $("activeEndYear") ? parseIntOrNull(getValue("activeEndYear")) : null;

    if (nat.length) meta.nationality = nat;
    if (aff.length) meta.affiliations = aff;
    if (fields.length) meta.fields = fields;
    if (roles.length) meta.roles = roles;
    if (activeStartYear != null) meta.activeStartYear = activeStartYear;
    if (activeEndYear != null) meta.activeEndYear = activeEndYear;

    item.meta = Object.keys(meta).length ? meta : null;
  }

  return item;
}

function requireAdminToken(actionLabel) {
  const token = prompt(`Admin token (x-admin-token) für ${actionLabel}:`);
  return token && token.trim() ? token.trim() : null;
}

// -------------------------
// IMAGE UPLOAD (R2 via Worker)
// -------------------------
async function uploadImageToR2() {
  const fileInput = $("imageFile");
  const urlInput = $("imageUrl");

  if (!fileInput) {
    setOutput('Fehler: <input id="imageFile"> nicht gefunden.');
    return;
  }

  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    setOutput("Bitte zuerst eine Bilddatei auswählen.");
    return;
  }

  const token = requireAdminToken("Upload");
  if (!token) {
    setOutput("Upload abgebrochen (kein Token).");
    return;
  }

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
      setOutput(
        `Upload-Fehler (HTTP ${res.status}):\n` +
          (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
      );
      return;
    }

    const data = parsed.ok ? parsed.json : null;
    if (!data || !data.imageUrl) {
      setOutput("Upload ok, aber keine imageUrl in der Antwort.");
      return;
    }

    if (urlInput) urlInput.value = data.imageUrl;

    setOutput("✔ Upload ok\n\n" + JSON.stringify(data, null, 2));
  } catch (e) {
    setOutput("Upload Fehler:\n" + (e?.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

// -------------------------
// AI AUTOFILL (preview only)
// -------------------------
async function autofillFromAI() {
  const title = getValue("title");
  const type = getValue("type");

  if (!title) {
    setOutput("Bitte zuerst einen Title eingeben.");
    return;
  }

  const btn = $("autofill");
  if (btn) btn.disabled = true;

  setOutput(`Auto-Fill läuft…\nPOST ${AUTOFILL_URL}`);

  const current = buildItem();

  let res;
  try {
    res = await fetch(AUTOFILL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type, current }),
    });
  } catch (e) {
    if (btn) btn.disabled = false;
    setOutput("Netzwerkfehler (autofill):\n" + (e?.message || e));
    return;
  }

  const parsed = await safeReadJson(res);

  if (!res.ok) {
    if (btn) btn.disabled = false;
    setOutput(
      `Autofill-Fehler (HTTP ${res.status}):\n` +
        (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
    );
    return;
  }

  const data = parsed.ok && parsed.json ? parsed.json : null;
  if (!data) {
    if (btn) btn.disabled = false;
    setOutput("Ungültige Autofill-Antwort.");
    return;
  }

  setValue("href", data.href);
  setValue("summary", data.summary);
  setValue("tags", data.tags);

  // People-specific years
  const currentType = getValue("type");
  if (currentType === "people") {
    if (data.birthYear != null && typeof data.birthYear === "number") {
      setValue("birthYear", String(data.birthYear));
    } else {
      setValue("birthYear", "");
    }

    if (data.deathYear != null && typeof data.deathYear === "number") {
      setValue("deathYear", String(data.deathYear));
    } else {
      setValue("deathYear", "");
    }
  } else {
    setValue("birthYear", "");
    setValue("deathYear", "");
  }

  setOutput(JSON.stringify(buildItem(), null, 2));
  if (btn) btn.disabled = false;
}

// -------------------------
// PUBLISH (to Worker /items -> D1)
// -------------------------
async function publishItem() {
  const token = requireAdminToken("Publish");
  if (!token) {
    setOutput("Publish abgebrochen (kein Token).");
    return;
  }

  const item = buildItem();

  // Publish base fields + meta
  const payload = {
    type: item.type,
    title: item.title,
    href: item.href,
    imageUrl: item.imageUrl,
    summary: item.summary,
    tags: Array.isArray(item.tags) ? item.tags : [],
    meta: item.meta, // NEW
    // sortYear absichtlich weggelassen -> Worker berechnet
  };

  setOutput(`Publishing…\nPOST ${ITEMS_URL}`);

  let res;
  try {
    res = await fetch(ITEMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    setOutput(
      "Publish Fehler: Failed to fetch\n\n" +
        `Request: POST ${ITEMS_URL}\n` +
        `Browser-Fehler: ${e?.message || e}`
    );
    return;
  }

  const parsed = await safeReadJson(res);

  if (!res.ok) {
    setOutput(
      `Publish-Fehler (HTTP ${res.status}):\n` +
        (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw)
    );
    return;
  }

  setOutput("✔ Published\n\n" + JSON.stringify(parsed.json, null, 2));
  alert("Item veröffentlicht ✔");

  await loadPublished();
}

// -------------------------
// LIST + DELETE (from Worker /items -> D1)
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
      escapeHtml(
        "Netzwerkfehler (list): Failed to fetch\n" +
          `GET ${ITEMS_URL}\n` +
          (e?.message || e)
      ) +
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

  const items =
    parsed.ok && parsed.json && Array.isArray(parsed.json.items)
      ? parsed.json.items
      : [];

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

  // Load into form
  publishedEl.querySelectorAll("button[data-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      try {
        const it = JSON.parse(btn.getAttribute("data-load"));

        setValue("type", it.type);
        setValue("title", it.title);
        setValue("href", it.href);
        setValue("imageUrl", it.imageUrl || "");
        setValue("summary", it.summary);

        const tags = normalizeTags(it.tags);
        setValue("tags", tags);

        // People years: prefer meta, fallback to legacy columns
        if (it.type === "people") {
          const by =
            it?.meta?.birthYear != null
              ? it.meta.birthYear
              : it.birthYear != null
              ? it.birthYear
              : "";
          const dy =
            it?.meta?.deathYear != null
              ? it.meta.deathYear
              : it.deathYear != null
              ? it.deathYear
              : "";

          setValue("birthYear", by !== "" ? String(by) : "");
          setValue("deathYear", dy !== "" ? String(dy) : "");

          // Optional future fields
          if ($("nationality")) setValue("nationality", it?.meta?.nationality ?? []);
          if ($("affiliations")) setValue("affiliations", it?.meta?.affiliations ?? []);
          if ($("fields")) setValue("fields", it?.meta?.fields ?? []);
          if ($("roles")) setValue("roles", it?.meta?.roles ?? []);
          if ($("activeStartYear")) setValue("activeStartYear", it?.meta?.activeStartYear ?? "");
          if ($("activeEndYear")) setValue("activeEndYear", it?.meta?.activeEndYear ?? "");
        } else {
          setValue("birthYear", "");
          setValue("deathYear", "");
          if ($("nationality")) setValue("nationality", "");
          if ($("affiliations")) setValue("affiliations", "");
          if ($("fields")) setValue("fields", "");
          if ($("roles")) setValue("roles", "");
          if ($("activeStartYear")) setValue("activeStartYear", "");
          if ($("activeEndYear")) setValue("activeEndYear", "");
        }

        setOutput(JSON.stringify(buildItem(), null, 2));
      } catch (e) {
        console.error(e);
      }
    });
  });

  // Delete
  publishedEl.querySelectorAll("button[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-id");
      if (!id) return;
      if (!confirm("Delete this item?")) return;

      const token = requireAdminToken("Delete");
      if (!token) {
        alert("Delete abgebrochen (kein Token).");
        return;
      }

      let delRes;
      try {
        delRes = await fetch(`${ITEMS_URL}?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-admin-token": token },
        });
      } catch (e) {
        alert("Delete failed: Failed to fetch\n" + (e?.message || e));
        return;
      }

      if (!delRes.ok) {
        const t = await delRes.text();
        alert("Delete failed: " + t);
        return;
      }

      await loadPublished();
    });
  });
}

// -------------------------
// UI wiring
// -------------------------
$("generate")?.addEventListener("click", () => {
  setOutput(JSON.stringify(buildItem(), null, 2));
});

$("autofill")?.addEventListener("click", () => {
  autofillFromAI().catch((err) => {
    console.error(err);
    setOutput(`Auto-Fill Fehler: ${err?.message || err}`);
    const b = $("autofill");
    if (b) b.disabled = false;
  });
});

$("publish")?.addEventListener("click", () => {
  publishItem().catch((err) => {
    console.error(err);
    setOutput(`Publish Fehler: ${err?.message || err}`);
  });
});

$("uploadImage")?.addEventListener("click", () => {
  uploadImageToR2().catch((err) => {
    console.error(err);
    setOutput(`Upload Fehler: ${err?.message || err}`);
    const b = $("uploadImage");
    if (b) b.disabled = false;
  });
});

$("refreshList")?.addEventListener("click", () => {
  loadPublished().catch(console.error);
});

// Show/hide people fields based on type
$("type")?.addEventListener("change", () => {
  const personFields = document.getElementById("personFields");
  if (personFields) {
    personFields.style.display = getValue("type") === "people" ? "block" : "none";
  }
});

// initial
loadPublished().catch(console.error);

// Show/hide people fields on page load
const personFields = document.getElementById("personFields");
if (personFields) {
  personFields.style.display = getValue("type") === "people" ? "block" : "none";
}
