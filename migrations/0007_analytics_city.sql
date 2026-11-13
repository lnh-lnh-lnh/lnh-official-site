ALTER TABLE analytics_events ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN network_city TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_analytics_city_created
ON analytics_events(country, region, city, created_at);
