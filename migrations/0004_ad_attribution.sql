ALTER TABLE applications ADD COLUMN utm_content TEXT;
ALTER TABLE applications ADD COLUMN utm_term TEXT;
ALTER TABLE applications ADD COLUMN gclid TEXT;
ALTER TABLE applications ADD COLUMN fbclid TEXT;
ALTER TABLE applications ADD COLUMN n_keyword TEXT;
ALTER TABLE applications ADD COLUMN attribution_json TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_utm_source ON applications(utm_source);
CREATE INDEX IF NOT EXISTS idx_applications_utm_campaign ON applications(utm_campaign);
