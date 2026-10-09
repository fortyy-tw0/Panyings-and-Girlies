"""Reminder Service — stores user-entered schedules and completion history.

It never suggests a schedule, never answers "what do I do after a missed
pill" — that is a fixed Companion reply pointing to the product leaflet /
pharmacist / doctor. The OS popup belongs to the frontend; this service only
reports what is due.

v2.1: pill time + discreet text live in an encrypted payload; each
reminder_event's type is AES-GCM encrypted too, so type-based filtering
decrypts pending rows in Python (event counts are tiny at MVP scale).
"""

import json
from datetime import datetime, time, timedelta

from .. import crypto

GRACE = timedelta(hours=2)
PILL = "pill"
PREGNANCY_TEST = "pregnancy_test"
DEFAULT_PILL_TEXT = "Time for your reminder."
DEFAULT_PT_TEXT = "Pregnancy test reminder."


def _enc(text):
    nonce, ct = crypto.encrypt_text(crypto.app_key(), text)
    return ct, nonce


def _dec(nonce, blob):
    return crypto.decrypt_text(crypto.app_key(), nonce, blob) if blob else None


def event_type(row):
    return _dec(row["nonce"], row["reminder_type_enc"])


def get_pill_reminder(conn):
    r = conn.execute("SELECT * FROM pill_reminder WHERE id=1").fetchone()
    if not r:
        return None
    payload = json.loads(_dec(r["nonce"], r["payload_enc"]) or "{}")
    return {
        "enabled": bool(r["enabled"]),
        "paused": bool(r["paused"]),
        "time_local": payload.get("time_local"),
        "discreet_text": payload.get("discreet_text"),
    }


def pill_text(reminder):
    if reminder and reminder.get("discreet_text"):
        return reminder["discreet_text"]
    return DEFAULT_PILL_TEXT


def _pending_events(conn, where="", params=()):
    rows = conn.execute(
        "SELECT * FROM reminder_event WHERE status='pending' " + where, params
    ).fetchall()
    return [(r, event_type(r)) for r in rows]


def ensure_pill_event(conn, now):
    """Create today's pending pill event if the reminder is enabled and the
    day has no event yet."""
    r = get_pill_reminder(conn)
    if not r or not r["enabled"] or r["paused"] or not r["time_local"]:
        return
    scheduled = datetime.combine(now.date(), time.fromisoformat(r["time_local"]))
    day_start = scheduled.replace(hour=0, minute=0).isoformat()
    existing = _pending_events(conn, "AND scheduled_for >= ?", (day_start,))
    if not any(t == PILL for _, t in existing):
        ct, nonce = _enc(PILL)
        conn.execute(
            "INSERT INTO reminder_event(reminder_type_enc, nonce, scheduled_for,"
            " status, created_at) VALUES (?,?,?, 'pending', ?)",
            (ct, nonce, scheduled.isoformat(), now.isoformat(timespec="seconds")),
        )
        conn.commit()


def sweep_missed(conn, now):
    # Only pill events auto-miss: a daily dose is time-sensitive; a one-off
    # pregnancy-test reminder should keep surfacing until the user responds.
    cutoff = (now - GRACE).isoformat(timespec="seconds")
    for r, t in _pending_events(conn, "AND scheduled_for < ?", (cutoff,)):
        if t == PILL:
            conn.execute("UPDATE reminder_event SET status='missed' WHERE id=?", (r["id"],))
    conn.commit()


def due_events(conn, now):
    """Events the frontend should surface right now (pending, time reached,
    still within the grace window)."""
    ensure_pill_event(conn, now)
    sweep_missed(conn, now)
    out = []
    for r, t in _pending_events(conn, "AND scheduled_for <= ? ORDER BY scheduled_for",
                              (now.isoformat(timespec="seconds"),)):
        text = pill_text(get_pill_reminder(conn)) if t == PILL else DEFAULT_PT_TEXT
        out.append({"event_id": r["id"], "type": t, "text": text,
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
    if event_type(r) == PREGNANCY_TEST and r["ref_id"]:
        conn.execute(
            "UPDATE pregnancy_test_reminder SET done=1 WHERE id=?", (r["ref_id"],)
        )
    conn.commit()
    return r


def clear_pending_pill_events(conn):
    for r, t in _pending_events(conn):
        if t == PILL:
            conn.execute("DELETE FROM reminder_event WHERE id=?", (r["id"],))
    conn.commit()


def insert_event(conn, reminder_type, ref_id, scheduled_for):
    ct, nonce = _enc(reminder_type)
    conn.execute(
        "INSERT INTO reminder_event(reminder_type_enc, nonce, ref_id, scheduled_for,"
        " status, created_at) VALUES (?,?,?,?, 'pending', ?)",
        (ct, nonce, ref_id, scheduled_for, datetime.now().isoformat(timespec="seconds")),
    )
