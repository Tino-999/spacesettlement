// assets/js/editor.js

const output = document.getElementById('output');

// Netlify Function endpoint (POST)
const AUTOFILL_URL =
  'https://inquisitive-sunshine-0cfe6a.netlify.app/.netlify/functions/autofill';

function getValue(id) {
  return document.getElementById(id).value.trim();
}

function setIfEmpty(id, value) {
  const el = document.getElementById(id);
  if (!el) return;

  const current = (el.value || '').trim();
  if (current) return; // do not overwrite user input

  if (value == null) return;

  if (Array.isArray(value)) {
    el.value = value.join(', ');
    return;
  }

  el.value = String(value);
}

function buildItem() {
  const tags = getValue('tags')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  return {
    type: getValue('type'),
    title: getValue('title'),
    href: getValue('href'),
    image: getValue('image'),
    summary: getValue('summary'),
    tags
  };
}

async function autofillFromAI() {
  const title = getValue('title');
  const type = getValue('type');

  if (!title) {
    output.textContent = 'Bitte zuerst einen Title eingeben.';
    return;
  }

  output.textContent = 'Auto-Fill läuft… (AI Vorschlag – bitte prüfen)';

  // Send current values too (helps the model not contradict and helps you keep manual edits)
  const current = buildItem();

  const res = await fetch(AUTOFILL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, type, current })
  });

  if (!res.ok) {
    // Try to show useful error messages
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();

  // Fill only empty fields
  // type is a <select> and never empty, so we leave it alone.
  setIfEmpty('href', data.href);
  setIfEmpty('image', data.image);
  setIfEmpty('summary', data.summary);
  setIfEmpty('tags', data.tags);

  // Refresh output
  output.textContent = JSON.stringify(buildItem(), null, 2);
}

document.getElementById('generate').addEventListener('click', () => {
  const item = buildItem();
  output.textContent = JSON.stringify(item, null, 2);
});

document.getElementById('download').addEventListener('click', () => {
  const item = buildItem();

  // load existing items.json if possible
  fetch('data/items.json')
    .then(r => r.json())
    .then(data => {
      data.push(item);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'items.json';
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => {
      // fallback: download only the single item
      const blob = new Blob([JSON.stringify(item, null, 2)], {
        type: 'application/json'
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'item.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
});

// Auto-fill button (must exist in admin.html)
const autofillBtn = document.getElementById('autofill');
if (autofillBtn) {
  autofillBtn.addEventListener('click', () => {
    autofillFromAI().catch(err => {
      console.error(err);
      output.textContent = `Auto-Fill Fehler: ${err?.message || err}`;
    });
  });
}
