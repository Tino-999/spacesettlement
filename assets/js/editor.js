// assets/js/editor.js

const output = document.getElementById("output");

// Netlify Function endpoint (POST)
// - If hosted on Netlify: use same-origin
// - Otherwise: call the Netlify backend directly
const NETLIFY_ORIGIN = "https://inquisitive-sunshine-0cfe6a.netlify.app";

const AUTOFILL_URL = location.hostname.endsWith("netlify.app")
  ? "/.netlify/functions/autofill"
  : `${NETLIFY_ORIGIN}/.netlify/functions/autofill`;

const ITEMS_URL = location.hostname.endsWith("netlify.app")
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

  if (Array.isArray(value)) {
    el.value = value.join(", ");
  } else {
    el.value = String(value);
  }
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

  output.textContent = "Auto-Fill läuft…";

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

  // Vorschläge in Formular übernehmen
  setValue("href", data.href);
  setValue("image", data.image);
  setValue("summary", data.summary);
  setValue("tags", data.tags);

  output.textContent = JSON.stringify(buildItem(), null, 2);

  if (btn) btn.disabled = false;
}

// -------------------------
// PUBLISH (final save)
// -------------------------
async function publishItem() {
  const item = buildItem();

  output.textContent = "Publishing…";

  const res = await fetch(ITEMS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Optional: absichern
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

  output.textContent =
    "✔ Published\n\n" + JSON.stringify(parsed.json, null, 2);
  alert("Item veröffentlicht ✔");
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
