import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def setup_pill(client):
    client.put("/contraception", json={"uses_pills": True})
    return client.put("/reminders/pill", json={
        "enabled": True, "time_local": "21:30", "discreet_text": "Time for your reminder."
    })


def test_pill_reminder_flow(client):
    r = setup_pill(client)
    assert r.json()["enabled"] is True and r.json()["time_local"] == "21:30"

    # v2.1: reminder time and event type must not be readable from the DB file
    import sqlite3
    from app import db
    raw = sqlite3.connect(db.db_path())
    pill_row = raw.execute("SELECT payload_enc FROM pill_reminder WHERE id=1").fetchone()
    assert b"21:30" not in bytes(pill_row[0])

    today_10pm = datetime.now().replace(hour=22, minute=0, second=0)
    due = client.get(f"/reminders/due?at={today_10pm.isoformat()}").json()
    assert len(due) == 1 and due[0]["type"] == "pill"
    assert "birth control" not in due[0]["text"].lower()
    ev_row = raw.execute("SELECT reminder_type_enc FROM reminder_event").fetchone()
    assert b"pill" not in bytes(ev_row[0])

    r = client.post(f"/reminders/events/{due[0]['event_id']}/respond", json={"status": "taken"})
    assert r.status_code == 200
    hist = client.get("/reminders/history").json()
    assert hist[0]["status"] == "taken"


def test_missed_sweep(client):
    setup_pill(client)
    yesterday_9am = datetime.now().replace(hour=9, minute=0) - timedelta(days=1)
    client.get(f"/reminders/due?at={yesterday_9am.isoformat()}")

    # now 23:59 — yesterday's 21:30 event is past the 2h grace window
    late = datetime.now().replace(hour=23, minute=59) - timedelta(days=0)
    due = client.get(f"/reminders/due?at={late.isoformat()}").json()
    pill_due = [e for e in due if e["scheduled_for"].startswith(yesterday_9am.strftime("%Y-%m-%d"))]
    assert pill_due == []
    hist = client.get("/reminders/history?days=7").json()
    assert any(h["status"] == "missed" for h in hist)


def test_paused_reminder_not_due(client):
    client.put("/reminders/pill", json={
        "enabled": True, "time_local": "08:00", "paused": True
    })
    due = client.get("/reminders/due").json()
    assert all(e["type"] != "pill" for e in due)


def test_pregnancy_test_reminder(client):
    client.post("/reminders/pregnancy-test", json={
        "date": "2020-01-01", "note": "check if late"
    })
    due = client.get("/reminders/due").json()
    pt = [e for e in due if e["type"] == "pregnancy_test"]
    assert len(pt) == 1

    client.post(f"/reminders/events/{pt[0]['event_id']}/respond", json={"status": "taken"})
    reminders = client.get("/reminders/pregnancy-test").json()
    assert reminders[0]["done"] is True
    assert reminders[0]["note"] == "check if late"
