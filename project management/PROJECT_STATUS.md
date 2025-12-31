# SpaceSettlement – Project Status

## Projektziel
Strukturierter Umbau der Library-Navigation und -Datenstruktur
zur klaren, nicht-bewertenden Trennung von:

- realen Raumfahrtprogrammen und Studien
- konzeptionellen Entwürfen
- fiktionalen Ideen
- Organisationen, Personen und Querschnittsthemen

Der Fokus liegt auf Nachvollziehbarkeit, Erweiterbarkeit
und einer faktenbasierten Taxonomie ohne Spekulation.

---

## Aktueller Navigationsbaum

PROJECTS  
- CLASS I   – Aktive staatliche Programme  
- CLASS II  – Offizielle Roadmaps und Strategien  
- CLASS III – Staatliche Studien und Architekturen  
- CLASS IV  – Technische Systementwürfe einzelner Akteure  
- CLASS V   – Strategisch-zivilisatorische Konzepte  

FICTION  
- CLASS A – Nachweisbarer Einfluss auf reale Raumfahrt-/Siedlungskonzepte  
- CLASS B – Prägung öffentlicher Narrative  
- CLASS C – Explorative / philosophische Szenarien  
- CLASS D – Raumfahrt als Kulisse  

ORGS  
PEOPLE  

TOPICS  
- Settlement Architectures  
  - Generation ships  
  - Space habitats (rotational)  
  - Planetary surface settlements  
  - Subsurface habitats  
- Law  
- Religion  

BOOKS  
MOVIES  
ALL

---

## Technischer Status

### Datenbank (Cloudflare D1)

#### Tabelle `items` (Schema, Stand nach Schritt 2)

Bestehende Spalten:
- `id` (TEXT, PRIMARY KEY)
- `type` (TEXT, NOT NULL)
- `title` (TEXT, NOT NULL)
- `href` (TEXT, NULL)
- `imageUrl` (TEXT, NULL)
- `summary` (TEXT, NULL)
- `tags` (TEXT, NULL)
- `birthYear` (INTEGER, NULL)
- `deathYear` (INTEGER, NULL)
- `createdAt` (TEXT, NOT NULL)
- `meta` (TEXT, NULL)
- `sortYear` (INTEGER, NULL)

Neue Spalten (additiv, Schritt 2):
- `project_class` (TEXT, NULL) – PROJECTS: CLASS I–V
- `fiction_class` (TEXT, NULL) – FICTION: CLASS A–D
- `topics` (TEXT, NULL) – TOPICS-Facette (Law, Religion, Settlement Architectures); Speicherformat noch nicht festgelegt


### Versionskontrolle
- Repository: `spacesettlement`
- Branch: `feature/classes-and-fiction`
- Sicherungstag: `pre-classes`

---

### Frontend (Stand nach Schritt 1.4)

Abgeschlossen:

- Filter-Reihenfolge angepasst:
  - PROJECTS | FICTION | ORGS | PEOPLE | TOPICS | BOOKS | MOVIES | CONCEPTS | ALL
- PROJECTS-Unterfilter (CLASS I–V) als UI-Platzhalter implementiert
- FICTION-Unterfilter (CLASS A–D) als UI-Platzhalter implementiert
- Subfilter werden **nur angezeigt**, wenn:
  - `projects` aktiv ist (CLASS I–V)
  - `fiction` aktiv ist (CLASS A–D)
- Keine funktionale Filterlogik für Klassen (UI-only)
- Keine Design- oder Layoutänderungen

Technische Details:
- Sichtbarkeit der Subfilter über JS gesteuert
- Robuster CSS-Fix:
