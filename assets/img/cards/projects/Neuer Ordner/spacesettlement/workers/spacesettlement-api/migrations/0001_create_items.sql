CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  href TEXT,
  imageUrl TEXT,
  summary TEXT,
  tags TEXT,
  birthYear INTEGER,
  deathYear INTEGER,
  createdAt TEXT NOT NULL,
  meta TEXT,
  sortYear INTEGER
);
