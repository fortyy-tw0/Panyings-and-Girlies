"""Seed the demo user: an irregular cycle matching the spec example.

Six period starts -> cycle lengths 27, 31, 36, 29, 34; last start 2025-09-28.
Prediction should come out Oct 25 - Nov 3 with LOW confidence and the
high_variability pattern flag. Also seeds cramps/fatigue logs on cycle
days 1-2 so symptom patterns have something to show.

Run:  python scripts/seed_demo.py        (from pushy-backend/, venv active)
"""

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import crypto, db
from app.prediction import engine

STARTS = [
    "2025-04-24", "2025-05-21", "2025-06-21",
    "2025-07-27", "2025-08-25", "2025-09-28",
]
PERIOD_DAYS = 5


def main():
    db.init_db()
    conn = db.connect()
    key = crypto.app_key()

    conn.execute("DELETE FROM period")
    conn.execute("DELETE FROM daily_log")
    conn.execute("DELETE FROM health_context")

    cats = {
        r["key"]: r["id"]
        for r in conn.execute("SELECT id, key FROM symptom_category").fetchall()
    }

    for s in STARTS:
        start = date.fromisoformat(s)
        end = (start + timedelta(days=PERIOD_DAYS - 1)).isoformat()
        conn.execute(
            "INSERT INTO period(start_date, end_date, flow_level, created_at, updated_at)"
            " VALUES (?,?,2,datetime('now'),datetime('now'))",
            (s, end),
        )
        for offset, cat in ((0, "cramps"), (1, "cramps"), (0, "energy")):
            day = (start + timedelta(days=offset)).isoformat()
            conn.execute(
                "INSERT OR REPLACE INTO daily_log(date, category_id, value)"
                " VALUES (?,?,?)",
                (day, cats[cat], "2" if cat == "cramps" else "1"),
            )

    conn.execute(
        "INSERT INTO health_context(kind, condition_name, status, created_at)"
        " VALUES ('cycle','irregular cycles','suspected_not_diagnosed',datetime('now'))"
    )
    conn.execute(
        "UPDATE profile SET language='en', cycle_type='irregular' WHERE id=1"
    )
    conn.commit()

    result = engine.compute(conn.execute("SELECT start_date, end_date FROM period").fetchall())
    print("Seeded %d periods." % len(STARTS))
    print("  status:     %s" % result["status"])
    print("  estimate:   %s" % result["estimate"])
    print("  window:     %s" % result["window"])
    print("  confidence: %s" % result["confidence"])
    print("  flags:      %s" % result["flags"])
    conn.close()


if __name__ == "__main__":
    main()
