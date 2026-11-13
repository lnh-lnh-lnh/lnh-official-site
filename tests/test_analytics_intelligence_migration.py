import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AnalyticsIntelligenceMigrationTest(unittest.TestCase):
    def test_migration_adds_privacy_preserving_intelligence_fields(self):
        connection = sqlite3.connect(":memory:")
        connection.execute(
            """
            CREATE TABLE analytics_events (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              event_name TEXT NOT NULL,
              path TEXT NOT NULL,
              referrer TEXT NOT NULL DEFAULT '',
              duration_ms INTEGER,
              metadata TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE applications (
              id TEXT PRIMARY KEY,
              created_at TEXT NOT NULL
            )
            """
        )
        connection.executescript(
            (ROOT / "migrations" / "0006_analytics_intelligence.sql").read_text()
        )

        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(analytics_events)")
        }
        indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(analytics_events)")
        }
        application_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(applications)")
        }
        application_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(applications)")
        }

        self.assertTrue(
            {
                "visitor_key", "country", "region", "asn", "as_organization",
                "bot_score", "verified_bot", "risk_score", "risk_reasons"
            }.issubset(columns)
        )
        self.assertTrue(
            {
                "idx_analytics_visitor_created",
                "idx_analytics_geo_created",
                "idx_analytics_risk_created"
            }.issubset(indexes)
        )
        self.assertTrue(
            {
                "network_country", "network_region", "network_asn", "network_organization",
                "automation_risk_score", "automation_risk_reasons"
            }.issubset(application_columns)
        )
        self.assertIn("idx_applications_risk_created", application_indexes)


if __name__ == "__main__":
    unittest.main()
