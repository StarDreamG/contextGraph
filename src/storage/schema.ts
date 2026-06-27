import type { ContextGraphDatabase } from "./database.js";

export function migrate(db: ContextGraphDatabase): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  hash TEXT NOT NULL,
  git_head TEXT,
  last_indexed_at TEXT NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  path TEXT NOT NULL,
  block_type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_id TEXT,
  block_id TEXT,
  confidence REAL DEFAULT 1.0,
  status TEXT DEFAULT 'confirmed',
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE,
  FOREIGN KEY(block_id) REFERENCES blocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(from_node) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY(to_node) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent TEXT,
  task TEXT,
  summary TEXT,
  git_head TEXT,
  started_at TEXT,
  ended_at TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS status (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS embeddings (
  block_id TEXT NOT NULL,
  node_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector BLOB NOT NULL,
  block_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (block_id, provider, model),
  FOREIGN KEY(block_id) REFERENCES blocks(id) ON DELETE CASCADE,
  FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE SET NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  node_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_sources_path ON sources(path);
CREATE INDEX IF NOT EXISTS idx_blocks_source ON blocks(source_id);
CREATE INDEX IF NOT EXISTS idx_nodes_source ON nodes(source_id);
CREATE INDEX IF NOT EXISTS idx_nodes_block ON nodes(block_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_provider_model ON embeddings(provider, model);
`);
}
