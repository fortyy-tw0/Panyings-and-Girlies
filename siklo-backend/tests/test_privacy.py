import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.privacy import service


def test_storage_report(client):
    r = client.get("/storage").json()
    assert r["pushy_db_bytes"] > 0
    assert r["total_bytes"] >= r["pushy_db_bytes"]


def test_export_contains_decrypted_data(client):
    client.post("/periods", json={"start_date": "2026-09-01", "end_date": "2026-09-05"})
    client.post("/notes", json={"date": "2026-09-02", "text": "private entry"})
    client.post("/activity", json={"date": "2026-09-03", "contraception": "condom"})
    data = client.get("/export").json()
    assert data["periods"][0]["start_date"] == "2026-09-01"
    assert data["notes"][0]["text"] == "private entry"
    assert data["sexual_activity"][0]["contraception"] == "condom"


def test_backup_restore_roundtrip(client):
    client.post("/periods", json={"start_date": "2026-09-01", "end_date": "2026-09-05"})
    client.post("/notes", json={"date": "2026-09-02", "text": "secret note"})

    r = client.post("/backup", json={"passphrase": "hunter2"})
    path = r.json()["path"]
    assert os.path.exists(path)

    # backup file does not contain plaintext
    assert b"secret note" not in open(path, "rb").read()

    client.request("DELETE", "/all", json={})
    assert client.get("/periods").json() == []

    r = client.post("/restore", json={"passphrase": "hunter2", "path": path})
    assert r.json() == {"restored": True}
    assert client.get("/periods").json()[0]["start_date"] == "2026-09-01"
    assert client.get("/notes").json()[0]["text"] == "secret note"


def test_restore_wrong_passphrase(client):
    r = client.post("/backup", json={"passphrase": "right"})
    path = r.json()["path"]
    r = client.post("/restore", json={"passphrase": "wrong", "path": path})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_passphrase"


def test_delete_all_wipes_data(client):
    client.post("/periods", json={"start_date": "2026-09-01", "end_date": "2026-09-05"})
    client.request("DELETE", "/all", json={})
    assert client.get("/periods").json() == []
    cats = client.get("/categories").json()
    assert any(c["key"] == "cramps" for c in cats)  # defaults re-seeded


def test_app_lock_blocks_api(client):
    client.post("/periods", json={"start_date": "2026-09-01", "end_date": "2026-09-05"})
    client.post("/lock", json={"passphrase": "pin"})

    r = client.get("/periods")
    assert r.status_code == 423 and r.json()["error"]["code"] == "locked"
    assert client.get("/health").status_code == 200  # health always allowed

    r = client.post("/unlock", json={"passphrase": "nope"})
    assert r.status_code == 400
    r = client.post("/unlock", json={"passphrase": "pin"})
    assert r.json() == {"unlocked": True}
    assert client.get("/periods").status_code == 200
    service.set_locked(False)  # reset for other tests in this session
