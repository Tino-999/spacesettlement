// assets/js/i18n.js
// Loads i18n JSON from Worker and fills DOM via data-i18n.
// Languages: de (primary), en (secondary). Fallback: en -> de.
// API base: ?api= override, else /data/config.json (api or apiBase), else same-origin.

(function () {
  function stripTrailingSlashes(s) {
    return String(s || "").replace(/\/+$/, "");
  }

  function getApiBaseFromQuery() {
    const params = new URLSearchParams(location.search);
    const api = params.get("api");
    if (api) return stripTrailingSlashes(api);
    return null;
  }

  async function getApiBaseFromConfig() {
    try {
      const res = await fetch("/data/config.json", { cache: "no-store" });
      if (!res.ok) return null;
      const cfg = await res.json();
      // support both keys
      const api = cfg.api || cfg.apiBase;
      if (!api) return null;
      return stripTrailingSlashes(api);
    } catch (_) {
      return null;
    }
  }

  async function resolveApiBase() {
    // 1) ?api=
    const q = getApiBaseFromQuery();
    if (q) return q;

    // 2) /data/config.json
    const c = await getApiBaseFromConfig();
    if (c) return c;

    // 3) same-origin fallback (may fail if site does not serve /i18n/*.json)
    return "";
  }

  function getSavedLang() {
    const v = (localStorage.getItem("lang") || "").toLowerCase();
    return v === "de" || v === "en" ? v : null;
  }

  function detectDeviceLang() {
    const device = String(
      (navigator.languages && navigator.languages[0]) || navigator.language || "en"
    ).toLowerCase();

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
      if (val.includes("\n")) el.style.whiteSpace = "pre-wrap";
      el.textContent = val;
    });
  }

  async function loadAndApply(lang) {
    const base = await resolveApiBase();

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
      const next = lang === "de" ? "en" : "de";
      localStorage.setItem("lang", next);
      location.reload(); // keeps query string
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
