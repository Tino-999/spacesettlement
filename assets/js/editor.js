// assets/js/editor.js

const output = document.getElementById("output");

// Netlify Function endpoint (POST)
// - If hosted on Netlify: use same-origin (cleaner, avoids CORS edge cases)
// - Otherwise (e.g. GitHub Pages): call the Netlify backend directly
const NETLIFY_ORIGIN = "https://inquisitive-sunshine-0cfe6a.netlify.app";

const AUTOFILL_URL = location.hostname.endsWith("netlify.app")
  ? "/.netlify/functions/autofill"
  : `${NETLIFY_ORIGIN}/.netlify/functions/autofill`;


function $(id) {
  return document.getElementById(id);
}

function getValue(id) {
  return $(id).value.trim();
}

function setValue(id, value) {
  const el = $(id);
  if (!el) return;

  if (value == null) return;

  if (Array.isArray(value)) {
    el.value = value.join(", ");
    return;
  }

  el.value = String(value);
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

  // send current state (optional, but helpful)
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
    output.textContent =
      "Netzwerkfehler beim Aufruf der Function.\n" + (e?.message || e);
    return;
  }

  const parsed = await safeReadJson(res);

  if (!res.ok) {
    if (btn) btn.disabled = false;
    output.textContent =
      `Fehler von der Function (HTTP ${res.status}).\n\n` +
      (parsed.ok ? JSON.stringify(parsed.json, null, 2) : parsed.raw);
    return;
  }

  // The function should ideally return the object directly.
  // But we handle both cases:
  // - direct object: { type,title,href,image,summary,tags }
  // - wrapper: { output_text: "{...json...}" } etc.
  let data = null;

  if (parsed.ok && parsed.json && typeof parsed.json === "object") {
    // If it already looks like our item, use it
    if (
      "summary" in parsed.json ||
      "tags" in parsed.json ||
      "href" in parsed.json ||
      "image" in parsed.json
    ) {
      data = parsed.json;
    } else if (typeof parsed.json.output_text === "string") {
      try {
        data = JSON.parse(parsed.json.output_text);
      } catch {
        // fallback
        data = null;
      }
    }
  }

  if (!data) {
    if (btn) btn.disabled = false;
    output.textContent =
      "Antwort war kein verwendbares JSON.\n\nRAW:\n" + parsed.raw;
    return;
  }

  // ✅ Überschreiben erlaubt, weil es nur Vorschläge sind:
  if (typeof data.href === "string") setValue("href", data.href);
  if (typeof data.image === "string") setValue("image", data.image);
  if (typeof data.summary === "string") setValue("summary", data.summary);
  if (Array.isArray(data.tags)) setValue("tags", data.tags);

  // Output aktualisieren
  output.textContent = JSON.stringify(buildItem(), null, 2);

  if (btn) btn.disabled = false;
}

$("generate").addEventListener("click", () => {
  output.textContent = JSON.stringify(buildItem(), null, 2);
});

$("download").addEventListener("click", () => {
  const item = buildItem();

  fetch("data/items.json")
    .then((r) => r.json())
    .then((data) => {
      data.push(item);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "items.json";
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => {
      const blob = new Blob([JSON.stringify(item, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "item.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
});

const autofillBtn = $("autofill");
if (autofillBtn) {
  autofillBtn.addEventListener("click", () => {
    autofillFromAI().catch((err) => {
      console.error(err);
      output.textContent = `Auto-Fill Fehler: ${err?.message || err}`;
      autofillBtn.disabled = false;
    });
  });
}
