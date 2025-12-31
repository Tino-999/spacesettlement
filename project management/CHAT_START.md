Wir setzen ein laufendes Projekt fort.



Projekt:

\- Name: SpaceSettlement

\- Repository: spacesettlement

\- Branch: feature/classes-and-fiction



Ziel:

Strukturierter Umbau der Library mit klarer Trennung von:

\- PROJECTS (CLASS I–V)

\- FICTION (CLASS A–D)

\- ORGS, PEOPLE, TOPICS, BOOKS, MOVIES



Aktueller Stand:

\- Schritt 0 abgeschlossen:

&nbsp; - Git-Tag gesetzt (pre-classes)

&nbsp; - D1-Schema lokal und remote gesichert

&nbsp; - Baseline-Screenshot der Library vorhanden



\- Schritt 1 abgeschlossen (Frontend):

&nbsp; - Filter-Reihenfolge angepasst

&nbsp; - PROJECTS-Unterfilter (CLASS I–V) implementiert (UI)

&nbsp; - FICTION-Unterfilter (CLASS A–D) implementiert (UI)

&nbsp; - Subfilter nur sichtbar bei aktivem PROJECTS- bzw. FICTION-Filter

&nbsp; - CSS-Fix: \[hidden] { display: none !important; }

&nbsp; - Keine Optikänderung

## Schritt 2 abgeschlossen

## Schritt 3 abgeschlossen

- Backend: GET `/items` Filter additiv ergänzt (`type`, `project_class`, `fiction_class`, `topic`).
- Response additiv erweitert (`project_class`, `fiction_class`, `topics`).
- Lokale Tests und Remote Smoke-Checks erfolgreich.

## Schritt 4 abgeschlossen

- Bedarf für Backfill identifiziert.
- Manuelles Backfill-Skript angelegt (nicht automatisch ausgeführt).
- PROJECTS-Klassen explizit gesetzt:
  - The Mars Project → CLASS I
  - starship → CLASS II
- Änderungen remote verifiziert.



Aktueller Navigationsbaum:

PROJECTS (CLASS I–V)

FICTION (CLASS A–D)

ORGS

PEOPLE

TOPICS (Settlement Architectures, Law, Religion)

BOOKS

MOVIES

ALL



Datenbank:

\- Cloudflare D1

\- Tabelle `items` existiert (Schema dokumentiert in PROJECT\_STATUS.md)

\- Änderungen erfolgen strikt additiv



Nächster Schritt:

Schritt 2 – D1 Datenmodell additiv erweitern

\- Klassen-Facetten für PROJECTS und FICTION

\- Topics (Law, Religion, Settlement Architectures)

\- Umsetzung als SQL-Migrationsdateien



Arbeitsmodus:

\- Schrittweise Vorgehensweise

\- Nach jedem Schritt explizite Bestätigung

\- Keine Spekulation

\- Keine Designänderungen ohne Freigabe



Ground Truth (verbindlich):

\- Wrangler ist konfiguriert über `wrangler.jsonc`

\- Cloudflare D1 ist lokal und remote verfügbar

\- Schema-Dumps dienen ausschließlich der Dokumentation

\- Migrationen erfolgen als additive SQL-Files

\- ARCHITECTURE.md und PROJECT\_STATUS.md gelten als maßgeblich



