-- 0006_add_relations_and_judgment.sql
-- Wirkungslinien zwischen Einträgen (relations) sowie wertendes Urteil und
-- Realitätsgrad an den Einträgen selbst.
--
-- Bestehende Zeilen bleiben unangetastet: alle neuen Spalten sind nullable
-- und ohne DEFAULT, d. h. sie sind für vorhandene Einträge leer.

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------
-- relations: gerichtete Wirkungslinie von einem Eintrag zu einem anderen
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relations (
  id             TEXT PRIMARY KEY,
  from_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  to_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('triggered_by','influenced','implements','contradicts')),
  note           TEXT,
  source_url     TEXT,
  source_checked TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (from_id, to_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to   ON relations(to_id);

-- -----------------------------------------------------------------------
-- items: Urteil, Realitätsgrad, Prüfdatum, Beleg
-- -----------------------------------------------------------------------
ALTER TABLE items ADD COLUMN verdict TEXT;

ALTER TABLE items ADD COLUMN reality TEXT
  CHECK (reality IS NULL OR reality IN (
    'in_operation',
    'under_construction',
    'funded',
    'announced',
    'dormant',
    'abandoned',
    'vision',
    'fiction'
  ));

ALTER TABLE items ADD COLUMN reality_checked TEXT;

ALTER TABLE items ADD COLUMN source_url TEXT;
