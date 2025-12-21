// assets/js/editor.js

const output = document.getElementById("output");
const publishedEl = document.getElementById("published");

// Netlify Functions (same-origin, relative paths)
const AUTOFILL_URL = "/.netlify/functions/autofill";
const ITEMS_URL = "/.netlify/functions/items";

// Helper: check if we are likely running with functions available.
// Netlify production: https and hostname includes netlify.app or custom domain.
// Netlify Dev: usually http://localhost:8888 with /.netlify/functions proxied.
// Plain static server: functions are NOT available.
const IS_LOCALHOST =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

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

function buildItem() {
  const tags = getValue("tags")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const item = {
    type: getValue("type"),
    title: getValue("title"),
    href: getValue("href"),
    image: getValue("image"),
    summary: getValue("summary"),
    tags,
  };

  if (item.type === "person") {
    const birthYear = getValue("birthYear");
    const deathYear = getValue("deathYear");

    if (birthYear) {
      const year = parseInt(birthYear, 10);
      if (!isNaN(year)) item.birthYear = year;
    }
    if (deathYear) {
      const year = parseInt(deathYear, 10);
      if (!isNaN(year)) item.deathYear = year;
    }
  }

  return item;
}

async function safeReadJson(res) {
  const text = await res.text();
  try {
    return { ok: true, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: false, raw: text };
  }
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
  output.textContent = String(text ?? "");
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
  setValue("image", data.image);
  setValue("summary", data.summary);
  setValue("tags", data.tags);

  const currentType = getValue("type");
  if (currentType === "person") {
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
// PUBLISH
// -------------------------
async function publishItem() {
  // Hinweis für lokalen Static-Server ohne Functions
  if (IS_LOCALHOST) {
    setOutput(
      "Publish deaktiviert auf localhost ohne Netlify Functions.\n" +
      "Starte über Netlify Dev oder teste Publish auf der Netlify-URL.\n" +
      `Ziel wäre: POST ${ITEMS_URL}`
    );
    return;
  }

  const item = buildItem();
  setOutput(`Publishing…\nPOST ${ITEMS_URL}`);

  let res;
  try {
    res = await fetch(ITEMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(item),
    });
  } catch (e) {
    setOutput(
      "Publish Fehler: Failed to fetch\n\n" +
      "Ursachen:\n" +
      "- Function nicht deployed oder falscher Function-Name.\n" +
      "- Netzwerk/Adblocker blockiert /.netlify/functions.\n\n" +
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
// LIST + DELETE
// -------------------------
async function loadPublished() {
  if (!publishedEl) return;

  // Lokal ohne Functions: nur Hinweis.
  if (IS_LOCALHOST) {
    publishedEl.textContent =
      "Published items nicht verfügbar auf localhost ohne Netlify Functions.";
    return;
  }

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
                <button class="btn btn--ghost" data-load='${escapeHtml(
                  JSON.stringify(it)
                ).replace(/'/g, "&#039;")}'>Load</button>
                <button class="btn" data-del-key="${key}">Delete</button>
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
        setValue("image", it.image);
        setValue("summary", it.summary);
        setValue("tags", Array.isArray(it.tags) ? it.tags : []);

        if (it.type === "person") {
          setValue("birthYear", it.birthYear != null ? String(it.birthYear) : "");
          setValue("deathYear", it.deathYear != null ? String(it.deathYear) : "");
        } else {
          setValue("birthYear", "");
          setValue("deathYear", "");
        }

        setOutput(JSON.stringify(buildItem(), null, 2));
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

      let delRes;
      try {
        delRes = await fetch(`${ITEMS_URL}?key=${encodeURIComponent(key)}`, {
          method: "DELETE",
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
    $("autofill").disabled = false;
  });
});

$("publish")?.addEventListener("click", () => {
  publishItem().catch((err) => {
    console.error(err);
    setOutput(`Publish Fehler: ${err?.message || err}`);
  });
});

$("refreshList")?.addEventListener("click", () => {
  loadPublished().catch(console.error);
});

// Show/hide person fields based on type
$("type")?.addEventListener("change", () => {
  const personFields = document.getElementById("personFields");
  if (personFields) {
    personFields.style.display = getValue("type") === "person" ? "block" : "none";
  }
});

// initial
loadPublished().catch(console.error);

// Show/hide person fields on page load
const personFields = document.getElementById("personFields");
if (personFields) {
  personFields.style.display = getValue("type") === "person" ? "block" : "none";
}
