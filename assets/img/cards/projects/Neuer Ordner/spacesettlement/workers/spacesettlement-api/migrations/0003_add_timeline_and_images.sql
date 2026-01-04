-- Adds generic timeline fields and image storage.

ALTER TABLE items ADD COLUMN startYear INTEGER;
ALTER TABLE items ADD COLUMN endYear INTEGER;

-- sortYear already exists in 0001_create_items.sql, but may be unused by API.
-- No ALTER for sortYear.

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  contentType TEXT NOT NULL,
  data BLOB NOT NULL,
  createdAt TEXT NOT NULL
);
