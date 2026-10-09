"""Reminder Service — stores user-entered schedules and completion history.

It never suggests a schedule, never answers "what do I do after a missed
pill" — that is a fixed Companion reply pointing to the product leaflet /
pharmacist / doctor. The OS popup belongs to the frontend; this service only
reports what is due.
"""

import json
from datetime import datetime, time, timedelta

from .. import crypto

GRACE = timedelta(hours=2)
PILL = "pill"
PREGNANCY_TEST = "pregnancy_test"
DEFAULT_PILL_TEXT = "Time for your reminder."
DEFAULT_PT_TEXT = "Pregnancy test reminder."


def get_pill_reminder(conn):
    return conn.execute("SELECT * FROM pill_reminder WHERE id=1").fetchone()


def pill_text(conn, row):
    key = crypto.app_key()
    if row and row["discreet_text_enc"]:
        return crypto.decrypt_text(key, row["nonce"], row["discreet_text_enc"])
    return DEFAULT_PILL_TEXT


def ensure_pill_event(conn, now):
    """Create today's pending pill event if the reminder is enabled and the
    day has no event yet."""
    r = get_pill_reminder(conn)
    if not r or not r["enabled"] or r["paused"] or not r["time_local"]:
        return
    scheduled = datetime.combine(now.date(), time.fromisoformat(r["time_local"]))
    day_start = scheduled.replace(hour=0, minute=0).isoformat()
    exists = conn.execute(
        "SELECT 1 FROM reminder_event WHERE reminder_type=? AND scheduled_for >= ?",
        (PILL, day_start),
    ).fetchone()
    if not exists:
        conn.execute(
            "INSERT INTO reminder_event(reminder_type, scheduled_for, status, created_at)"
            " VALUES (?,?, 'pending', ?)",
            (PILL, scheduled.isoformat(), now.isoformat(timespec="seconds")),
        )
        conn.commit()


def sweep_missed(conn, now):
    # Only pill events auto-miss: a daily dose is time-sensitive; a one-off
    # pregnancy-test reminder should keep surfacing until the user responds.
    conn.execute(
        "UPDATE reminder_event SET status='missed'"
        " WHERE status='pending' AND reminder_type=? AND scheduled_for < ?",
        (PILL, (now - GRACE).isoformat(timespec="seconds")),
    )
    conn.commit()


def due_events(conn, now):
    """Events the frontend should surface right now (pending, time reached,
    still within the grace window)."""
    ensure_pill_event(conn, now)
    sweep_missed(conn, now)
    rows = conn.execute(
        "SELECT * FROM reminder_event WHERE status='pending' AND scheduled_for <= ?"
        " ORDER BY scheduled_for",
        (now.isoformat(timespec="seconds"),),
    ).fetchall()
    out = []
    for r in rows:
        if r["reminder_type"] == PILL:
            text = pill_text(conn, get_pill_reminder(conn))
        else:
            text = DEFAULT_PT_TEXT
        out.append({"event_id": r["id"], "type": r["reminder_type"], "text": text,
                    "scheduled_for": r["scheduled_for"]})
    return out


def respond(conn, event_id, status):
    r = conn.execute("SELECT * FROM reminder_event WHERE id=?", (event_id,)).fetchone()
    if not r:
        return None
    conn.execute(
        "UPDATE reminder_event SET status=?, responded_at=? WHERE id=?",
        (status, datetime.now().isoformat(timespec="seconds"), event_id),
    )
    if r["reminder_type"] == PREGNANCY_TEST and r["ref_id"]:
        conn.execute(
            "UPDATE pregnancy_test_reminder SET done=1 WHERE id=?", (r["ref_id"],)
        )
    conn.commit()
    return r


def clear_pending_pill_events(conn):
    conn.execute(
        "DELETE FROM reminder_event WHERE reminder_type=? AND status='pending'", (PILL,)
    )
    conn.commit()
