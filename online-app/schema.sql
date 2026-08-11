CREATE TABLE IF NOT EXISTS experience_invites (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  quota_total INTEGER NOT NULL,
  quota_used INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  content TEXT NOT NULL,
  score REAL,
  mime_type TEXT NOT NULL,
  image_key TEXT NOT NULL,
  room_state TEXT NOT NULL DEFAULT 'unknown',
  has_bed INTEGER,
  budget_enabled INTEGER NOT NULL DEFAULT 1,
  room_area TEXT NOT NULL DEFAULT 'unknown',
  budget TEXT NOT NULL DEFAULT 'unspecified'
);

CREATE INDEX IF NOT EXISTS idx_analyses_visitor_created
ON analyses(visitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS optimizations (
  id TEXT PRIMARY KEY,
  analysis_id TEXT,
  visitor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  style_id TEXT NOT NULL,
  style_name TEXT NOT NULL,
  mime_type TEXT,
  image_key TEXT,
  image_url TEXT,
  room_area TEXT NOT NULL DEFAULT 'unknown',
  budget TEXT NOT NULL DEFAULT 'unspecified'
);

CREATE INDEX IF NOT EXISTS idx_optimizations_visitor_created
ON optimizations(visitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY,
  provider_task_id TEXT,
  visitor_id TEXT NOT NULL,
  analysis_id TEXT,
  style_id TEXT NOT NULL,
  style_name TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_mime_type TEXT NOT NULL,
  room_area TEXT NOT NULL DEFAULT 'unknown',
  budget TEXT NOT NULL DEFAULT 'unspecified',
  invite_code TEXT,
  immediate_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_visitor_created
ON generation_tasks(visitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_visitor_created
ON usage_events(visitor_id, created_at DESC);
