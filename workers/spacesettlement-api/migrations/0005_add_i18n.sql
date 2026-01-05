-- 0005_add_i18n.sql
-- i18n storage for online editing (de/en) with draft and published values.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS i18n_texts (
  key TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('de','en')),
  entry_id TEXT, -- nullable for global UI strings
  field TEXT NOT NULL,
  draft TEXT,
  published TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (key, lang),
  FOREIGN KEY (entry_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_i18n_entry_field_lang
ON i18n_texts(entry_id, field, lang);

CREATE INDEX IF NOT EXISTS idx_i18n_lang_field
ON i18n_texts(lang, field);

CREATE INDEX IF NOT EXISTS idx_i18n_updated
ON i18n_texts(updated_at);

CREATE TRIGGER IF NOT EXISTS trg_i18n_texts_updated_at
AFTER UPDATE ON i18n_texts
FOR EACH ROW
BEGIN
  UPDATE i18n_texts
  SET updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  WHERE key = NEW.key AND lang = NEW.lang;
END;

-- Seed global About page strings (published == draft initially)
INSERT OR IGNORE INTO i18n_texts (key, lang, entry_id, field, draft, published)
VALUES
  ('about.title', 'en', NULL, 'about', 'About', 'About'),
  ('about.title', 'de', NULL, 'about', 'Über', 'Über'),
  ('about.text', 'en', NULL, 'about',
'This site is not a manifesto. It does not say space settlement is necessary. It does not say space settlement is the only path.\n\nThis site is also not a wiki. It is not meant to be complete. It is meant to spark thinking.',
'This site is not a manifesto. It does not say space settlement is necessary. It does not say space settlement is the only path.\n\nThis site is also not a wiki. It is not meant to be complete. It is meant to spark thinking.'),
  ('about.text', 'de', NULL, 'about',
'Diese Website ist kein Manifest. Sie sagt nicht, dass Space Settlement notwendig ist. Sie sagt nicht, dass Space Settlement der einzige Weg ist.\n\nDiese Website ist auch kein Wiki. Sie ist nicht als vollständig gedacht. Sie soll zum Nachdenken anregen.',
'Diese Website ist kein Manifest. Sie sagt nicht, dass Space Settlement notwendig ist. Sie sagt nicht, dass Space Settlement der einzige Weg ist.\n\nDiese Website ist auch kein Wiki. Sie ist nicht als vollständig gedacht. Sie soll zum Nachdenken anregen.');
