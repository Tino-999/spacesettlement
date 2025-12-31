# SpaceSettlement – Architekturentscheidungen

## Zweck dieses Dokuments
Dieses Dokument beschreibt **stabile Architekturentscheidungen**.
Es erklärt das **Warum**, nicht den aktuellen Arbeitsstand.

Änderungen erfolgen selten und bewusst.

---

## Grundprinzipien

- Faktenbasiert, nicht narrativ
- Trennung von Realität, Konzept und Fiction
- Keine Prognosen
- Keine Wertungen
- Erweiterbarkeit ohne Umbau

---

## Objekt-Typen (Primär)

Die Library kennt folgende **Primärtypen**:

- PROJECT
- ORG
- PERSON
- TOPIC
- BOOK
- MOVIE

Diese Typen ändern sich nicht.

---

## PROJECTS – Klassifikation I–V

PROJECTS werden nach **institutionellem Status** klassifiziert:

- CLASS I  
  Aktive staatliche Programme mit Umsetzungsmandat

- CLASS II  
  Offizielle Roadmaps und Strategien ohne eigenes Programmbudget

- CLASS III  
  Staatliche Studien und Architekturen ohne Umsetzungsmandat

- CLASS IV  
  Technische Systementwürfe einzelner Akteure

- CLASS V  
  Strategisch-zivilisatorische Konzepte ohne technische Ableitung

Diese Klassen sind **nicht vergleichend**, sondern **beschreibend**.

---

## FICTION – Klassifikation A–D

Fiction wird getrennt von PROJECTS behandelt.

Kriterium ist **nachweisbarer Einfluss**, nicht Realismus.

- CLASS A  
  Nachweisbarer Einfluss auf reale Raumfahrt- oder Siedlungskonzepte

- CLASS B  
  Prägung öffentlicher Raumfahrt- und Siedlungsnarrative

- CLASS C  
  Explorative oder philosophische Szenarien

- CLASS D  
  Raumfahrt als Kulisse ohne konzeptionellen Einfluss

FICTION-Klassen sind **nicht mit PROJECT-Klassen vergleichbar**.

---

## TOPICS – Querschnittsebene

TOPICS sind **semantische Knoten**, keine Objekte.

Sie verbinden:
- PROJECTS
- FICTION
- BOOKS
- MOVIES

Aktuelle Topic-Cluster:
- Settlement Architectures
- Law
- Religion

TOPICS besitzen keine Klassen.

---

## Datenmodell (Kurzfassung)

### D1 – Tabelle `items` (relevante Facettenfelder)

- `project_class` (TEXT, NULL)
  - Gültig für Typ `PROJECT`
  - Wertebereich: CLASS I–V (gemäß Abschnitt „PROJECTS – Klassifikation I–V“)

- `fiction_class` (TEXT, NULL)
  - Gültig für Typ `FICTION`
  - Wertebereich: CLASS A–D (gemäß Abschnitt „FICTION – Klassifikation A–D“)

- `topics` (TEXT, NULL)
  - Gültig für Typ `TOPIC`
  - Wertebereich: Topic-Cluster (Settlement Architectures, Law, Religion)
  - Speicherformat ist nicht festgelegt


- Cloudflare D1 (SQLite)
- Tabelle `items` als zentrales Objekt
- Klassen als **Facetten**, nicht als Typen
- Änderungen erfolgen **additiv**

---

## UI-Prinzipien

- Keine Rankings
- Keine Scores
- Keine Hervorhebung durch Farben
- Klassen werden als neutrale Badges dargestellt
- Filter sind kombinierbar, aber unabhängig

---

## Abgrenzungen

Nicht Teil der Architektur:
- Motivationale Texte
- Zukunftsversprechen
- Erfolgseinschätzungen
- Technische Machbarkeitsbewertungen

---

## Stabilitätsgarantie

Diese Architektur ist darauf ausgelegt:
- neue Programme,
- neue Fiction,
- neue Topics

aufzunehmen, ohne bestehende Inhalte umzustrukturieren.
