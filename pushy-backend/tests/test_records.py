import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import db


def test_onboarding_saves_profile(client):
    r = client.post("/onboarding", json={
        "language": "fil",
        "cycle_type": "irregular",
        "health_context": [{"kind": "condition", "condition_name": "PCOS",
                            "status": "suspected_not_diagnosed"}],
        "enabled_categories": ["cramps", "mood"],
    })
    assert r.status_code == 200
    assert r.json()["profile"]["language"] == "fil"
    cats = {c["key"]: c["enabled"] for c in client.get("/categories").json()}
    assert cats["cramps"] and not cats["flow"]


def test_onboarding_rejects_bad_status(client):
    r = client.post("/onboarding", json={
        "health_context": [{"status": "confirmed_by_doctor"}],
    })
    assert r.status_code == 400


def test_period_crud_and_overlap(client):
    r = client.post("/periods", json={"start_date": "2026-09-01", "end_date": "2026-09-05", "flow_level": 2})
    assert r.status_code == 201
    pid = r.json()["period"]["id"]

    # overlapping entry is rejected
    r = client.post("/periods", json={"start_date": "2026-09-04", "end_date": "2026-09-08"})
    assert r.status_code == 409

    # non-overlapping entry is fine
    r = client.post("/periods", json={"start_date": "2026-09-28", "end_date": "2026-10-02"})
    assert r.status_code == 201

    # end before start rejected
    r = client.post("/periods", json={"start_date": "2026-11-10", "end_date": "2026-11-05"})
    assert r.status_code == 400

    # update + delete
    r = client.put(f"/periods/{pid}", json={"start_date": "2026-09-01", "end_date": "2026-09-06"})
    assert r.status_code == 200 and r.json()["period"]["end_date"] == "2026-09-06"
    assert client.delete(f"/periods/{pid}").status_code == 204
    assert client.delete(f"/periods/{pid}").status_code == 404


def test_ongoing_period_blocks_overlap(client):
    client.post("/periods", json={"start_date": "2026-10-01"})  # ongoing, no end
    r = client.post("/periods", json={"start_date": "2026-10-20", "end_date": "2026-10-24"})
    assert r.status_code == 409


def test_log_upsert_and_disabled_category(client):
    r = client.post("/logs", json={"date": "2026-10-01", "category": "cramps", "value": "2"})
    assert r.status_code == 201
    r = client.post("/logs", json={"date": "2026-10-01", "category": "cramps", "value": "3"})
    logs = r.json()
    same_day = [l for l in logs if l["category"] == "cramps"]
    assert len(same_day) == 1 and same_day[0]["value"] == "3"

    client.put("/categories", json={"updates": [{"key": "mood", "enabled": False}]})
    r = client.post("/logs", json={"date": "2026-10-01", "category": "mood"})
    assert r.status_code == 400


def test_notes_encrypted_roundtrip(client):
    client.post("/notes", json={"date": "2026-10-01", "text": "felt really tired today"})
    notes = client.get("/notes").json()
    assert notes[0]["text"] == "felt really tired today"

    raw = sqlite3.connect(db.db_path()).execute("SELECT text_enc FROM note").fetchone()[0]
    assert b"tired" not in bytes(raw)


def test_activity_encrypted_roundtrip(client):
    r = client.post("/activity", json={"date": "2026-10-02", "contraception": "condom", "note": "x"})
    assert r.status_code == 201
    items = client.get("/activity").json()
    assert items[0]["contraception"] == "condom"

    raw = sqlite3.connect(db.db_path()).execute("SELECT payload_enc FROM sexual_activity").fetchone()[0]
    assert b"condom" not in bytes(raw)

    # every field except date is skippable
    r = client.post("/activity", json={"date": "2026-10-03"})
    assert r.status_code == 201


def test_contraception_pref(client):
    assert client.get("/contraception").json()["uses_pills"] is None
    r = client.put("/contraception", json={"uses_pills": True, "method": "pills"})
    assert r.json() == {"uses_pills": True, "method": "pills"}
