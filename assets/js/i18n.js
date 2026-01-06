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
    return api ? stripTrailingSlashes(api) : null;
  }

  async function getApiBaseFromConfig() {
    try {
      const res = await fetch("/data/config.json", { cache: "no-store" });
      if (!res.ok) return null;
      const cfg = await res.json();
      const api = cfg.api || cfg.apiBase;
      return api ? stripTrailingSlashes(api) : null;
    } catch {
      return null;
    }
  }

  async function resolveApiBase() {
    const q = getApiBaseFromQuery();
    if (q) return q;

    const c = await getApiBaseFromConfig();
    if (c) return c;

    return ""; // same-origin
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
    // JSON liefert oft echte \n als "\\n" (escaped). Wir machen daraus echte Newlines.
    s = s.replace(/\\n/g, "\n");
    s = s.replace(/\\t/g, "\t");
    return s;
  }

  function setTextPreserveLinks(el, text) {
    // Wenn das Element Kinder hat (z.B. <a>), und nur das Kind den data-i18n Key trägt,
    // dann soll i18n.js NICHT den Parent überschreiben. Darum:
    // - Wir setzen immer nur auf dem Element selbst.
    el.textContent = text;
  }

  function applyToDom(dict) {
    window.__I18N_DICT__ = dict;

    const nodes = document.querySelectorAll("[data-i18n]");
    nodes.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;

      const raw = dict[key];
      if (!isNonEmptyString(raw)) return;

      const val = normalizeValue(raw);

      // Newlines darstellen
      if (val.includes("\n")) el.style.whiteSpace = "pre-wrap";

      setTextPreserveLinks(el, val);
    });
  }

  async function loadDictForLang(lang) {
    const base = await resolveApiBase();

    const deUrl = `${base}/i18n/de.json`;
    const enUrl = `${base}/i18n/en.json`;

    const de = await fetchJson(deUrl);

    if (lang === "de") return de;

    let en = {};
    try {
      en = await fetchJson(enUrl);
    } catch {
      en = {};
    }

    // Merge: DE baseline, EN overrides if non-empty
    const merged = { ...de };
    for (const [k, v] of Object.entries(en || {})) {
      if (isNonEmptyString(v)) merged[k] = v;
    }
    return merged;
  }

  function setToggleLabel(lang) {
    const t = document.getElementById("lang-toggle");
    if (!t) return;
    // Optional: Label zeigt die aktuelle Sprache
    t.textContent = String(lang).toUpperCase();
  }

  function bindToggle() {
    const t = document.getElementById("lang-toggle");
    if (!t) return;

    t.addEventListener("click", async (e) => {
      e.preventDefault();

      const current = window.__I18N_LANG__ || resolveLang();
      const next = current === "de" ? "en" : "de";

      localStorage.setItem("lang", next);
      window.__I18N_LANG__ = next;
      setToggleLabel(next);

      try {
        const dict = await loadDictForLang(next);
        applyToDom(dict);
      } catch (err) {
        console.error(err);
      }

      // Signal für app.js / andere Scripts: Sprache hat gewechselt
      document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang: next } }));
    });
  }

  async function ensureLoadedAndApplied() {
    const lang = window.__I18N_LANG__ || resolveLang();
    window.__I18N_LANG__ = lang;
    setToggleLabel(lang);

    const dict = await loadDictForLang(lang);
    applyToDom(dict);
  }

  // Expose for dynamic renders (cards)
  window.applyI18n = async function () {
    try {
      await ensureLoadedAndApplied();
    } catch (e) {
      console.error(e);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindToggle();
    ensureLoadedAndApplied().catch((e) => console.error(e));
  });
})();
