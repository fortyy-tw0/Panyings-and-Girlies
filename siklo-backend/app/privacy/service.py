"""Privacy & Storage — export, encrypted backup/restore, wipe, app lock.

Backup format (.pushybackup):
    line 1: JSON header {magic, version, kdf, kdf params, salt, nonce}
    rest  : AES-256-GCM ciphertext of the export JSON
Wrong passphrase -> GCM auth failure -> clean "bad_passphrase" error.
Chat data is never included because conversations never reach disk.
"""

import json
import os
from datetime import datetime

from .. import crypto, db

MAGIC = "PUSHYBACKUP"
FORMAT_VERSION = 1

_locked = False


def is_locked():
    return _locked


def set_locked(value):
    global _locked
    _locked = value


def load_lock_state(conn):
    row = conn.execute("SELECT app_lock_hash FROM profile WHERE id=1").fetchone()
    set_locked(bool(row and row["app_lock_hash"]))


# ---------- export / import ----------

def export_data(conn):
    key = crypto.app_key()

    def dec(nonce, blob):
        return crypto.decrypt_text(key, nonce, blob) if blob else None

    logs = conn.execute(
        "SELECT l.date, c.key AS category, l.value, l.note_enc, l.nonce"
        " FROM daily_log l JOIN symptom_category c ON c.id = l.category_id"
    ).fetchall()

    def all_(table):
        return [dict(r) for r in conn.execute(f"SELECT * FROM {table}").fetchall()]

    profile = dict(conn.execute("SELECT * FROM profile WHERE id=1").fetchone())
    profile.pop("app_lock_hash", None)
    profile["enabled_categories"] = json.loads(profile.pop("enabled_categories_json") or "[]")

    pill = conn.execute("SELECT * FROM pill_reminder WHERE id=1").fetchone()
    pill_json = None
    if pill and pill["payload_enc"]:
        payload = json.loads(dec(pill["nonce"], pill["payload_enc"]))
        pill_json = {"enabled": bool(pill["enabled"]), "paused": bool(pill["paused"]),
                     "time_local": payload.get("time_local"),
                     "discreet_text": payload.get("discreet_text")}

    cp = conn.execute("SELECT * FROM contraception_pref WHERE id=1").fetchone()
    cp_json = json.loads(dec(cp["nonce"], cp["payload_enc"]) or "{}") if cp else {}

    events = []
    for e in all_("reminder_event"):
        e["reminder_type"] = dec(e.pop("nonce"), e.pop("reminder_type_enc"))
        events.append(e)

    return {
        "version": FORMAT_VERSION,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "profile": profile,
        "health_context": [
            json.loads(dec(r["nonce"], r["payload_enc"])) for r in all_("health_context")
        ],
        "periods": all_("period"),
        "symptom_categories": all_("symptom_category"),
        "daily_logs": [
            {"date": r["date"], "category": r["category"], "value": r["value"],
             "note": dec(r["nonce"], r["note_enc"])}
            for r in logs
        ],
        "notes": [
            {"date": r["date"], "text": dec(r["nonce"], r["text_enc"]), "created_at": r["created_at"]}
            for r in all_("note")
        ],
        "sexual_activity": [
            json.loads(dec(r["nonce"], r["payload_enc"])) for r in all_("sexual_activity")
        ],
        "contraception_pref": cp_json,
        "pill_reminder": pill_json,
        "reminder_events": events,
        "pregnancy_test_reminders": [
            {"date": r["date"], "note": dec(r["nonce"], r["note_enc"]), "done": bool(r["done"])}
            for r in all_("pregnancy_test_reminder")
        ],
    }


def wipe_user_data(conn):
    for t in ("daily_log", "note", "sexual_activity", "period", "health_context",
              "reminder_event", "pregnancy_test_reminder", "symptom_category",
              "pill_reminder", "contraception_pref", "profile"):
        conn.execute(f"DELETE FROM {t}")
    conn.execute(
        "INSERT OR IGNORE INTO profile(id, created_at) VALUES (1, datetime('now'))"
    )
    conn.execute("INSERT OR IGNORE INTO contraception_pref(id) VALUES (1)")
    conn.executemany(
        "INSERT OR IGNORE INTO symptom_category(key, label, is_custom, enabled)"
        " VALUES (?,?,0,1)",
        db.DEFAULT_CATEGORIES,
    )
    conn.commit()


def import_data(conn, data):
    if not isinstance(data, dict) or "periods" not in data:
        raise ValueError("not a SikLo export")
    key = crypto.app_key()
    wipe_user_data(conn)

    p = data.get("profile") or {}
    conn.execute(
        "UPDATE profile SET language=?, cycle_type=?, enabled_categories_json=? WHERE id=1",
        (p.get("language", "en"), p.get("cycle_type"),
         json.dumps(p.get("enabled_categories", []))),
    )
    for hc in data.get("health_context", []):
        status = hc.get("status", "prefer_not_to_say")
        if status not in ("diagnosed_user_reported", "suspected_not_diagnosed",
                          "prefer_not_to_say"):
            status = "prefer_not_to_say"
        nonce, ct = crypto.encrypt_text(key, json.dumps({
            "kind": hc.get("kind"), "condition_name": hc.get("condition_name"),
            "status": status,
        }))
        conn.execute(
            "INSERT INTO health_context(payload_enc, nonce, created_at) VALUES (?,?,?)",
            (ct, nonce, hc.get("created_at")),
        )
    for r in data.get("periods", []):
        conn.execute(
            "INSERT INTO period(start_date, end_date, flow_level, created_at, updated_at)"
            " VALUES (?,?,?,?,?)",
            (r["start_date"], r.get("end_date"), r.get("flow_level"),
             r.get("created_at"), r.get("updated_at")),
        )
    for c in data.get("symptom_categories", []):
        conn.execute(
            "INSERT INTO symptom_category(key, label, is_custom, enabled) VALUES (?,?,?,?)"
            " ON CONFLICT(key) DO UPDATE SET label=excluded.label,"
            " is_custom=excluded.is_custom, enabled=excluded.enabled",
            (c["key"], c["label"], int(c.get("is_custom", 0)), int(c.get("enabled", 1))),
        )
    cat_ids = {
        r["key"]: r["id"]
        for r in conn.execute("SELECT id, key FROM symptom_category").fetchall()
    }
    for l in data.get("daily_logs", []):
        cid = cat_ids.get(l["category"])
        if not cid:
            continue
        nonce, ct = crypto.encrypt_text(key, l["note"]) if l.get("note") else (None, None)
        conn.execute(
            "INSERT OR REPLACE INTO daily_log(date, category_id, value, note_enc, nonce)"
            " VALUES (?,?,?,?,?)",
            (l["date"], cid, l.get("value"), ct, nonce),
        )
    for n in data.get("notes", []):
        nonce, ct = crypto.encrypt_text(key, n["text"])
        conn.execute(
            "INSERT INTO note(date, text_enc, nonce, created_at) VALUES (?,?,?,?)",
            (n.get("date"), ct, nonce, n.get("created_at")),
        )
    for a in data.get("sexual_activity", []):
        nonce, ct = crypto.encrypt_text(key, json.dumps(a))
        conn.execute(
            "INSERT INTO sexual_activity(payload_enc, nonce, created_at) VALUES (?,?,?)",
            (ct, nonce, datetime.now().isoformat(timespec="seconds")),
        )
    cp = data.get("contraception_pref") or {}
    if cp:
        nonce, ct = crypto.encrypt_text(key, json.dumps({
            "uses_pills": cp.get("uses_pills"), "method": cp.get("method"),
        }))
        conn.execute(
            "UPDATE contraception_pref SET payload_enc=?, nonce=?, updated_at=? WHERE id=1",
            (ct, nonce, datetime.now().isoformat(timespec="seconds")),
        )
    pill = data.get("pill_reminder")
    if pill:
        nonce, ct = crypto.encrypt_text(key, json.dumps({
            "time_local": pill.get("time_local"),
            "discreet_text": pill.get("discreet_text"),
        }))
        conn.execute(
            "INSERT OR REPLACE INTO pill_reminder(id, enabled, paused, payload_enc,"
            " nonce, created_at, updated_at) VALUES (1,?,?,?,?,?,?)",
            (int(pill["enabled"]), int(pill.get("paused", 0)), ct, nonce,
             datetime.now().isoformat(timespec="seconds"),
             datetime.now().isoformat(timespec="seconds")),
        )
    for e in data.get("reminder_events", []):
        nonce, ct = crypto.encrypt_text(key, e["reminder_type"])
        conn.execute(
            "INSERT INTO reminder_event(reminder_type_enc, nonce, ref_id, scheduled_for,"
            " status, responded_at, created_at) VALUES (?,?,?,?,?,?,?)",
            (ct, nonce, e.get("ref_id"), e["scheduled_for"], e["status"],
             e.get("responded_at"), e.get("created_at")),
        )
    for r in data.get("pregnancy_test_reminders", []):
        nonce, ct = crypto.encrypt_text(key, r["note"]) if r.get("note") else (None, None)
        conn.execute(
            "INSERT INTO pregnancy_test_reminder(date, note_enc, nonce, done, created_at)"
            " VALUES (?,?,?,?,?)",
            (r["date"], ct, nonce, int(r.get("done", 0)),
             datetime.now().isoformat(timespec="seconds")),
        )
    conn.commit()


# ---------- backup file ----------

def make_backup(conn, passphrase, path=None):
    payload = json.dumps(export_data(conn)).encode("utf-8")
    salt = os.urandom(16)
    key = crypto.derive_key(passphrase, salt)
    nonce, ct = crypto.encrypt(key, payload)
    header = {
        "magic": MAGIC, "version": FORMAT_VERSION, "kdf": "scrypt",
        "n": crypto.SCRYPT_N, "r": crypto.SCRYPT_R, "p": crypto.SCRYPT_P,
        "salt": salt.hex(), "nonce": nonce.hex(),
    }
    if not path:
        path = os.path.join(
            db.data_dir(), "backup-%s.pushybackup" % datetime.now().strftime("%Y%m%d-%H%M%S")
        )
    with open(path, "wb") as f:
        f.write(json.dumps(header).encode("utf-8") + b"\n" + ct)
    return path


def read_backup(path, passphrase):
    with open(path, "rb") as f:
        raw = f.read()
    header_raw, ct = raw.split(b"\n", 1)
    header = json.loads(header_raw)
    if header.get("magic") != MAGIC:
        raise ValueError("not a .pushybackup file")
    if header.get("version") != FORMAT_VERSION:
        raise ValueError("unsupported backup version %s" % header.get("version"))
    key = crypto.derive_key(passphrase, bytes.fromhex(header["salt"]))
    plain = crypto.decrypt_or_raise(key, bytes.fromhex(header["nonce"]), ct)
    return json.loads(plain)


def storage_report():
    def size(path):
        return os.path.getsize(path) if os.path.exists(path) else 0

    model = os.environ.get("PUSHY_MODEL_PATH", "")
    parts = {
        "pushy_db_bytes": size(db.db_path()),
        "library_db_bytes": size(db.library_db_path()),
        "key_bytes": size(db.key_path()),
        "model_bytes": size(model) if model else 0,
    }
    parts["total_bytes"] = sum(parts.values())
    return parts
