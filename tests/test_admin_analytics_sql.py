import re
import sqlite3
import unittest
from pathlib import Path


SOURCE = Path(__file__).parents[1] / "functions/api/admin/analytics.js"


def sql_constant(name):
    source = SOURCE.read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = `([\s\S]*?)`;", source)
    if not match:
        raise AssertionError(f"{name} SQL을 찾지 못했습니다.")
    return match.group(1)


class AnalyticsSqlTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute(
            "CREATE TABLE analytics_events (id TEXT PRIMARY KEY, session_id TEXT, "
            "event_name TEXT, created_at TEXT)"
        )
        self.db.executemany(
            "INSERT INTO analytics_events VALUES (?, ?, 'page_view', ?)",
            [
                ("1", "same-session", "2026-11-11T15:05:00.000Z"),
                ("2", "same-session", "2026-11-11T15:10:00.000Z"),
                ("3", "same-session", "2026-11-11T16:00:00.000Z"),
                ("4", "other-session", "2026-11-11T16:15:00.000Z"),
                ("5", "same-session", "2026-11-12T15:05:00.000Z"),
            ],
        )

    def tearDown(self):
        self.db.close()

    def test_duplicate_page_views_count_once_as_session_but_all_as_views(self):
        rows = self.db.execute(
            sql_constant("HOURLY_TIMELINE_SQL"),
            (
                "2026-11-11T15:00:00.000Z",
                "2026-11-12T15:00:00.000Z",
                "2026-11-11T15:00:00.000Z",
                "2026-11-12T15:00:00.000Z",
            ),
        ).fetchall()

        self.assertEqual(rows, [(0, 1, 2), (1, 1, 2)])
        self.assertEqual(sum(row[1] for row in rows), 2)

    def test_same_session_is_counted_once_again_after_kst_date_rollover(self):
        rows = self.db.execute(
            sql_constant("DAILY_TIMELINE_SQL"),
            (
                "2026-11-11T15:00:00.000Z",
                "2026-11-13T15:00:00.000Z",
                "2026-11-11T15:00:00.000Z",
                "2026-11-13T15:00:00.000Z",
            ),
        ).fetchall()

        self.assertEqual(rows, [("2026-11-12", 2, 4), ("2026-11-13", 1, 1)])


if __name__ == "__main__":
    unittest.main()
