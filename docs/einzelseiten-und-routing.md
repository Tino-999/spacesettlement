# Einzelseiten unter /item/&lt;id&gt; — Entscheidung zum Ausliefern

Stand: 2026-09-10

## Was gebaut ist

Der Worker `workers/spacesettlement-api` beantwortet drei zusätzliche Pfade
mit fertigem HTML bzw. Text, ohne dass die Seite etwas per JavaScript
nachladen muss:

| Pfad | Inhalt |
|---|---|
| `GET /item/<id>` | Einzelseite: Titel, Zusammenfassung, Urteil, Realitätsgrad mit Prüfdatum, Belege, Wirkungslinien als echte Links. Dazu `canonical`, `hreflang` de/en/x-default, OpenGraph, Twitter-Card und zwei JSON-LD-Blöcke. |
| `GET /sitemap.xml` | Alle Eintragsadressen, je mit den `hreflang`-Alternativen. |
| `GET /robots.txt` | Verweist auf `/sitemap.xml`. |

Sprache: `/item/<id>` ist deutsch, `/item/<id>?lang=en` englisch. Ohne
`?lang=` entscheidet der `Accept-Language`-Header, Standard ist Deutsch.
Die Texte kommen aus `i18n_texts` (veröffentlichte Fassung); fehlt die
Übersetzung, greift der deutsche Text aus `items` — dieselbe Fallback-Regel,
die die Seite schon im Frontend benutzt.

## Warum Worker-Routen und nicht Pages Functions

space-settlement.net wird bisher statisch ausgeliefert (Cloudflare;
`/library.html` wird auf `/library` umgeleitet, unbekannte Pfade
beantwortet der Host mit `index.html`). Zwei Wege standen zur Wahl:

1. **Pages Function** (`functions/item/[id].js`) im Wurzelverzeichnis des
   Repos. Läge dicht am bestehenden Deploy per Git-Push, bräuchte aber eine
   eigene D1-Bindung, die nur im Cloudflare-Dashboard gesetzt werden kann —
   ein Handgriff außerhalb des Repos, der bei jedem neuen Pages-Projekt
   wieder vergessen werden kann.

2. **Worker-Routen** auf den bestehenden API-Worker. Der hat die D1- und
   R2-Bindung bereits, der gesamte Code liegt an einer Stelle, und die
   Routen stehen in `wrangler.jsonc` — also im Repo, versioniert, ohne
   Klickarbeit im Dashboard.

Gewählt ist **Weg 2**. In `wrangler.jsonc` sind unter `env.production`
genau drei Routen eingetragen:

```
space-settlement.net/item/*
space-settlement.net/sitemap.xml
space-settlement.net/robots.txt
```

Alles andere bleibt beim bisherigen Hosting. Eine engere Route gewinnt in
Cloudflare gegen eine weitere, deshalb greift das auch dann, wenn auf der
Zone ein Catch-all liegt.

## Warum eine eigene Umgebung "production"

`wrangler.jsonc` trug bislang oben den Namen `spacesettlement-api-staging`,
die Seite spricht aber laut `data/config.json` mit `spacesettlement-api`.
Ein Deploy mit der bisherigen Konfiguration wäre also am falschen Worker
gelandet. Statt den Namen oben stillschweigend zu ändern, ist Produktion
als eigene Umgebung ausgewiesen:

```bash
npx wrangler deploy --env production
```

Ohne `--env production` deployt weiterhin der Staging-Worker, wie bisher.

## Migration

```bash
npx wrangler d1 migrations apply spacesettlement-db --remote
```

`0006_add_relations_and_judgment.sql` legt die Tabelle `relations` an und
hängt `verdict`, `reality`, `reality_checked` und `source_url` an `items`.
Alle neuen Spalten sind nullable und ohne Vorgabewert — bestehende Zeilen
bleiben unverändert und leer.

## Was danach von Hand zu prüfen ist

- `https://space-settlement.net/item/<eine-bestehende-id>` liefert HTML,
  und der Text steht im Quelltext (`curl` statt Browser prüfen).
- `https://space-settlement.net/robots.txt` und `/sitemap.xml` liefern
  Text bzw. XML, nicht die `index.html` des Hosts.
- Sitemap in der Google Search Console einreichen.
