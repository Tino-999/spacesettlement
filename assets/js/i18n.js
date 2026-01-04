const DEFAULT = "en";
const lang = localStorage.getItem("lang") || DEFAULT;

// Browser über die aktuelle Sprache informieren
document.documentElement.lang = lang;

const EN = {
  "about.text": "This site is not a manifesto. It does not say space settlement is necessary. It does not say space settlement is the only path. This site is also not a wiki. It is not meant to be complete. It is meant to spark thinking."
};

const DE = {
  "about.text": `Diese Website ist kein Manifest.
Sie sagt nicht, dass Space Settlement notwendig ist.
Sie sagt nicht, dass Space Settlement der einzige Weg ist.

Diese Website ist auch kein Wiki.
Sie ist nicht als vollständig gedacht.
Sie soll zum Nachdenken anregen.

Sie sammelt belastbares, überprüfbares Wissen und ordnet es ein.
Ziel ist es, eine gemeinsame Grundlage für eine nüchterne Diskussion darüber zu schaffen, ob eine dauerhafte menschliche Präsenz jenseits der Erde sinnvoll ist, notwendig ist oder vermeidbar ist.

Details sind wichtig, aber sie sind nicht das gesamte Argument.
Der Fokus liegt auf den größeren Randbedingungen und Abwägungen, die die Fragestellung prägen.

Keine Überzeugung.
Kein Zukunftshype.
Nur die Fakten und die Struktur, die nötig sind, um die Frage durchzudenken.`
};

// Fallback: Ziel überschreibt EN
const dict = (lang === "de") ? { ...EN, ...DE } : EN;

// Nur Elemente mit data-i18n werden gesetzt
if (lang === "de") {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
}

// Toggle
const toggle = document.getElementById("lang-toggle");
if (toggle) {
  toggle.textContent = lang.toUpperCase();

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    const next = (lang === "en") ? "de" : "en";
    localStorage.setItem("lang", next);
    location.reload();
  });
}
