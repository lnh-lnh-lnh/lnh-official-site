ALTER TABLE analytics_events ADD COLUMN visitor_key TEXT NOT NULL DEFAULT '';
ALTER TABLE analytics_events ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE analytics_events ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE analytics_events ADD COLUMN asn INTEGER;
ALTER TABLE analytics_events ADD COLUMN as_organization TEXT NOT NULL DEFAULT '';
ALTER TABLE analytics_events ADD COLUMN bot_score INTEGER;
ALTER TABLE analytics_events ADD COLUMN verified_bot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_events ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_events ADD COLUMN risk_reasons TEXT NOT NULL DEFAULT '[]';

ALTER TABLE applications ADD COLUMN network_country TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN network_region TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN network_asn INTEGER;
ALTER TABLE applications ADD COLUMN network_organization TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN automation_risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN automation_risk_reasons TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_analytics_visitor_created
ON analytics_events(visitor_key, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_geo_created
ON analytics_events(country, region, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_risk_created
ON analytics_events(risk_score, created_at);

CREATE INDEX IF NOT EXISTS idx_applications_risk_created
ON applications(automation_risk_score, created_at);
