const EN = {
  "nav.about": "About",
  "about.title": "About",
  "about.text": "Permanent human presence beyond Earth."
};

const DE = {
  "nav.about": "Über",
  "about.title": "Über"
  // about.text fehlt → Fallback EN
};

const DEFAULT = "en";
const lang = localStorage.getItem("lang") || DEFAULT;

// Fallback: Ziel überschreibt EN
const dict = lang === "de" ? { ...EN, ...DE } : EN;

document.querySelectorAll("[data-i18n]").forEach(el => {
  el.textContent = dict[el.dataset.i18n] || "";
});

document.getElementById("toggle")?.addEventListener("click", () => {
  const next = lang === "en" ? "de" : "en";
  localStorage.setItem("lang", next);
  location.reload();
});
