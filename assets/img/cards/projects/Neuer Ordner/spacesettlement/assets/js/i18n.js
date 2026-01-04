/* assets/js/i18n.js
   EN is the reference language.
   Fallback: target -> EN.
*/
(() => {
  const DEFAULT = "en";
  const lang = localStorage.getItem("lang") || DEFAULT;

  const EN = {
    "nav.index": "Index",
    "nav.about": "About",
    "about.title": "About",
    "lang.label": "EN"
  };

  const DE = {
    "nav.index": "Index",
    "nav.about": "Über",
    "about.title": "Über",
    "lang.label": "DE"
  };

  const dict = lang === "de" ? { ...EN, ...DE } : EN;

  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = dict[key] ?? "";
  });

  const btn = document.getElementById("lang-toggle");
  if (btn) {
    btn.textContent = (lang === "de") ? "DE" : "EN";
    btn.addEventListener("click", () => {
      const next = (lang === "de") ? "en" : "de";
      localStorage.setItem("lang", next);
      location.reload();
    });
  }
})();
