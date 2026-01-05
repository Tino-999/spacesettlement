// assets/js/i18n.js
// Loads i18n JSON from Worker and fills DOM via data-i18n.
// Languages: de (primary), en (secondary). Fallback: en -> de.
// API base: ?api= override, else same-origin.

(function () {
  function getApiBase() {
    const params = new URLSearchParams(location.search);
    const api = params.get("api");
    if (api) return api.replace(/\/+$/, "");
    return ""; // same-origin
  }

  function getSavedLang() {
    const v = (localStorage.getItem("lang") || "").toLowerCase();
    return (v === "de" || v === "en") ? v : null;
  }

  function detectDeviceLang() {
    const device = String((navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase();
    if (device.startsWith("de")) return "de";
    if (device.startsWith("en")) return "en";
    return "en";
  }

  function resolveLang() {
    return getSavedLang() || detectDeviceLang();
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`i18n fetch failed: ${res.status} ${url}`);
    return await res.json();
  }

  function isNonEmptyString(v) {
    return typeof v === "string" && v.trim() !== "";
  }

  function normalizeValue(v) {
    if (!isNonEmptyString(v)) return "";
    // Unescape common sequences stored in JSON (e.g., "\\n")
    let s = v;
    s = s.replace(/\\n/g, "\n");
    s = s.replace(/\\t/g, "\t");
    return s;
  }

  function applyToDom(dict) {
    const nodes = document.querySelectorAll("[data-i18n]");
    nodes.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const raw = dict[key];
      if (!isNonEmptyString(raw)) return;

      const val = normalizeValue(raw);

      // If the value contains newlines, ensure it renders as intended
      if (val.includes("\n")) {
        el.style.whiteSpace = "pre-wrap";
      }
      el.textContent = val;
    });
  }

  async function loadAndApply(lang) {
    const base = getApiBase();
    const deUrl = `${base}/i18n/de.json`;
    const enUrl = `${base}/i18n/en.json`;

    const de = await fetchJson(deUrl);

    if (lang === "de") {
      applyToDom(de);
      return;
    }

    let en = {};
    try {
      en = await fetchJson(enUrl);
    } catch (_) {
      en = {};
    }

    // Merge: de base + en overlay (only non-empty strings)
    const merged = { ...de };
    for (const [k, v] of Object.entries(en || {})) {
      if (isNonEmptyString(v)) merged[k] = v;
    }
    applyToDom(merged);
  }

  function setToggleLabel(lang) {
    const t = document.getElementById("lang-toggle");
    if (!t) return;
    t.textContent = String(lang).toUpperCase();
  }

  function bindToggle(lang) {
    const t = document.getElementById("lang-toggle");
    if (!t) return;

    t.addEventListener("click", (e) => {
      e.preventDefault();
      const next = (lang === "de") ? "en" : "de";
      localStorage.setItem("lang", next);

      // reload and keep query string (?api=...)
      location.reload();
    });
  }

  // Expose for dynamic renders (cards)
  window.applyI18n = async function () {
    const lang = resolveLang();
    setToggleLabel(lang);
    await loadAndApply(lang);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const lang = resolveLang();
    setToggleLabel(lang);
    bindToggle(lang);
    loadAndApply(lang).catch((e) => console.error(e));
  });
})();
