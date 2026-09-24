CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE,
  service TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  space_type TEXT NOT NULL,
  location TEXT,
  budget TEXT,
  desired_start TEXT,
  concern TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT,
  source_path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  consent_at TEXT NOT NULL,
  survey_token_hash TEXT,
  survey_token_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_service ON applications(service);

CREATE TABLE IF NOT EXISTS brief_surveys (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  household TEXT NOT NULL,
  daily_routine TEXT NOT NULL,
  current_discomfort TEXT NOT NULL,
  must_keep TEXT NOT NULL,
  priorities TEXT NOT NULL,
  flexible_items TEXT,
  storage_and_flow TEXT,
  decision_makers TEXT,
  reference_links TEXT,
  additional_note TEXT,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  duration_ms INTEGER,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_path ON analytics_events(path);
