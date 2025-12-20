// assets/js/editor.js

const output = document.getElementById("output");
const publishedEl = document.getElementById("published");

// Netlify Function endpoint (POST/GET/DELETE)
const NETLIFY_ORIGIN = "https://inquisitive-sunshine-0cfe6a.netlify.app";

const IS_NETLIFY = location.hostname.endsWith("netlify.app");

const AUTOFILL_URL = IS_NETLIFY
  ? "/.netlify/functions/autofill"
  : `${NETLIFY_ORIGIN}/.netlify/functions/autofill`;

const ITEMS_URL = IS_NETLIFY
  ? "/.netlify/functions/items"
  : `${NETLIFY_ORIGIN}/.netlify/functions/items`;

function $(id) {
  return document.getElementById(id);
}

function getValue(id) {
  return $(id).value.trim();
}

function setValue(id, value) {
  const el = $(id);
  if (!el || value == null) return;

  if (Array.isArray(value)) el.value = value.join(", ");
  else el.value = String(value);
}

function buildItem() {
  const tags = getValue("tags")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    type: getValue("type"),
    title: getValue("title"),
    href: getValue("href"),
    image: getValue("image"),
    summary: getValue("summary"),
    tags,
  };
}

async function safeReadJson(res) {
  const text = await res.text();
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, raw: text };
  }
}

// -------------------------
// AI AUTOFILL (preview only)
// -------------------------
async function autofillFromAI() {
  const title = getValue("title");
  const type = getValue("type");

  if (!title) {
    output.textContent = "Bitte zuerst einen Title eingeben.";
    return;
  }

  const btn = $("autofill");
  if (btn) btn.disabled = true;

  output.textContent = `Auto-Fill läuft…\nPOST ${AUTOFILL_URL}`;

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
    output.textContent = "Netzwerkfehler:\n" + (e?.message || e);
    return;
  }

  const parsed = await safeReadJson(res);

  if (!res.ok) {
    if (btn) btn.disabled = false;
    output.textContent =
      `Autofill-Fehler (HTTP ${res.status}):\n` +
      (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw);
    return;
  }

  const data = parsed.ok && parsed.json ? parsed.json : null;
  if (!data) {
    if (btn) btn.disabled = false;
    output.textContent = "Ungültige Autofill-Antwort.";
    return;
  }

  setValue("href", data.href);
  setValue("image", data.image);
  setValue("summary", data.summary);
  setValue("tags", data.tags);

  output.textContent = JSON.stringify(buildItem(), null, 2);

  if (btn) btn.disabled = false;
}

// -------------------------
// PUBLISH
// -------------------------
async function publishItem() {
  const item = buildItem();

  output.textContent = "Publishing…";

  const res = await fetch(ITEMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Optional: protect later
      // "x-admin-token": window.ADMIN_TOKEN || ""
    },
    body: JSON.stringify(item),
  });

  const parsed = await safeReadJson(res);

  if (!res.ok) {
    output.textContent =
      `Publish-Fehler (HTTP ${res.status}):\n` +
      (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw);
    return;
  }

  output.textContent = "✔ Published\n\n" + JSON.stringify(parsed.json, null, 2);
  alert("Item veröffentlicht ✔");

  // refresh list after publish
  await loadPublished();
}

// -------------------------
// LIST + DELETE
// -------------------------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

async function loadPublished() {
  if (!publishedEl) return;

  publishedEl.textContent = "Loading…";

  const res = await fetch(ITEMS_URL, { cache: "no-store" });
  const parsed = await safeReadJson(res);

  if (!res.ok) {
    publishedEl.innerHTML = `<pre class="code" style="white-space:pre-wrap;">${escapeHtml(parsed.raw)}</pre>`;
    return;
  }

  const items = parsed.ok && parsed.json && Array.isArray(parsed.json.items) ? parsed.json.items : [];

  if (!items.length) {
    publishedEl.textContent = "No published items yet.";
    return;
  }

  publishedEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${items.map((it) => {
        const title = escapeHtml(it.title || "");
        const type = escapeHtml(it.type || "");
        const createdAt = escapeHtml(it.createdAt || "");
        const key = escapeHtml(it._key || "");
        const id = escapeHtml(it.id || "");
        return `
          <div style="display:flex; align-items:center; gap:10px; justify-content:space-between; border:1px solid rgba(255,255,255,0.08); padding:10px; border-radius:14px;">
            <div style="min-width:0;">
              <div style="opacity:0.7; font-size:12px;">${type} · ${createdAt}</div>
              <div style="font-weight:700; letter-spacing:0.04em;">${title}</div>
              <div style="opacity:0.6; font-size:12px; word-break:break-all;">${id}</div>
            </div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
              <button class="btn btn--ghost" data-load='${escapeHtml(JSON.stringify(it)).replace(/'/g, "&#039;")}'>Load</button>
              <button class="btn" data-del-key="${key}">Delete</button>
            </div>
          </div>
        `;
      }).join("")}
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
        setValue("image", it.image);
        setValue("summary", it.summary);
        setValue("tags", Array.isArray(it.tags) ? it.tags : []);
        output.textContent = JSON.stringify(buildItem(), null, 2);
      } catch (e) {
        console.error(e);
      }
    });
  });

  // Delete
  publishedEl.querySelectorAll("button[data-del-key]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-del-key");
      if (!key) return;
      if (!confirm("Delete this item?")) return;

      const delRes = await fetch(`${ITEMS_URL}?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: {
          // Optional: protect later
          // "x-admin-token": window.ADMIN_TOKEN || ""
        },
      });

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
$("generate").addEventListener("click", () => {
  output.textContent = JSON.stringify(buildItem(), null, 2);
});

$("autofill").addEventListener("click", () => {
  autofillFromAI().catch((err) => {
    console.error(err);
    output.textContent = `Auto-Fill Fehler: ${err?.message || err}`;
    $("autofill").disabled = false;
  });
});

$("publish").addEventListener("click", () => {
  publishItem().catch((err) => {
    console.error(err);
    output.textContent = `Publish Fehler: ${err?.message || err}`;
  });
});

$("refreshList")?.addEventListener("click", () => {
  loadPublished().catch(console.error);
});

// initial
loadPublished().catch(console.error);
