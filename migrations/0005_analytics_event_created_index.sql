CREATE INDEX IF NOT EXISTS idx_analytics_event_created
ON analytics_events(event_name, created_at);
