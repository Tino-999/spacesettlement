# SpaceSettlement – Projektstatus

## Ziel
Strukturierter Umbau der Library-Struktur zur sauberen Trennung von:
- realen Raumfahrtprogrammen,
- institutionellen Studien,
- Konzepten,
- Fiction,
- Querschnittsthemen (Recht, Religion, Architekturen).

Keine Spekulation. Keine Bewertung. Faktenbasierte Taxonomie.

---

## Aktueller Navigationsbaum

PROJECTS  
- CLASS I  (Aktive staatliche Programme)  
- CLASS II (Offizielle Roadmaps und Strategien)  
- CLASS III (Staatliche Studien und Architekturen)  
- CLASS IV (Technische Systementwürfe einzelner Akteure)  
- CLASS V (Strategisch-zivilisatorische Konzepte)

FICTION  
- CLASS A (Nachweisbarer Einfluss auf reale Raumfahrt-/Siedlungskonzepte)  
- CLASS B (Prägung öffentlicher Narrative)  
- CLASS C (Explorative / philosophische Szenarien)  
- CLASS D (Raumfahrt als Kulisse)

ORGS  
PEOPLE  

TOPICS  
- Settlement Architectures  
  - Generation ships  
  - Space habitats (rotational)  
  - Planetary surface settlements  
  - Subsurface habitats  
  - Mobile vs. fixed settlements  
- LAW  
- RELIGION  

BOOKS  
MOVIES  
ALL

---

## Technischer Stand

### Git
- Sicherungstag: `pre-classes`
- Arbeitsbranch: `feature/classes-and-fiction`

### Frontend
- Filter-Reihenfolge angepasst:
  - PROJECTS | FICTION | ORGS | PEOPLE | TOPICS | BOOKS | MOVIES | CONCEPTS | ALL
- `FICTION` aktuell als Platzhalter ohne Logik
- Optik unverändert (Baseline-Screenshot vorhanden)

### Datenbank (Cloudflare D1 – Remote, pre-classes)

Tabelle `items`:

- id TEXT PRIMARY KEY  
- type TEXT NOT NULL  
- title TEXT NOT NULL  
- href TEXT  
- imageUrl TEXT  
- summary TEXT  
- tags TEXT  
- birthYear INTEGER  
- deathYear INTEGER  
- createdAt TEXT NOT NULL  
- meta TEXT  
- sortYear INTEGER  

Indizes:
- idx_items_type  
- idx_items_title  
- idx_items_createdAt  

Schema-Sicherungen:
- d1-schema-pre-classes.txt (lokal)
- d1-schema-remote-pre-classes.txt (remote)

---

## Letzter abgeschlossener Schritt
Schritt 1.1 – Frontend: Filter-Reihenfolge geändert, FICTION hinzugefügt (UI only)

Commit:
Frontend: reorder library filters and add FICTION placeholder

---

## Nächster geplanter Schritt
Schritt 1.2 – PROJECTS-Unterfilter (CLASS I–V)
- nur UI-Platzhalter
- keine Logik
- keine Styles
- keine Datenänderung

---

## Arbeitsprinzipien
- Schrittweises Vorgehen
- Keine Optikbrüche
- Additive Änderungen am Datenmodell
- Saubere Trennung von Realität, Konzept, Fiction und Themen
