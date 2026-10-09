"""Records Service: periods, daily logs, categories, notes, sexual activity,
contraception preferences, onboarding profile. Everything the user
intentionally logs — the only module that writes personal data.
"""

import json
from datetime import date
from datetime import date as dt_date
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator

from .. import crypto
from ..core.dependencies import get_conn
from ..core.errors import api_error

router = APIRouter()

FAR_FUTURE = "9999-12-31"  # used to treat an ongoing period as open-ended in overlap checks
CONDITION_STATUSES = (
    "diagnosed_user_reported",
    "suspected_not_diagnosed",
    "prefer_not_to_say",
)
CONTRACEPTION_OPTIONS = ("condom", "pills", "other", "none", "not_sure")


def now():
    return datetime.now().isoformat(timespec="seconds")


# ---------- onboarding ----------

class HealthContextIn(BaseModel):
    kind: Optional[str] = None
    condition_name: Optional[str] = None
    status: Literal[
        "diagnosed_user_reported", "suspected_not_diagnosed", "prefer_not_to_say"
    ]


class OnboardingIn(BaseModel):
    language: str = "en"
    cycle_type: Optional[str] = None
    health_context: list[HealthContextIn] = []
    enabled_categories: list[str] = []


@router.post("/onboarding")
def onboarding(body: OnboardingIn, conn=Depends(get_conn)):
    conn.execute(
        "UPDATE profile SET language=?, cycle_type=?, enabled_categories_json=? WHERE id=1",
        (body.language, body.cycle_type, json.dumps(body.enabled_categories)),
    )
    conn.execute("DELETE FROM health_context")
    key = crypto.app_key()
    for hc in body.health_context:
        # status enum is enforced here in code: a CHECK constraint cannot
        # see inside the encrypted payload, and nothing may ever promote
        # suspected_not_diagnosed to diagnosed automatically
        if hc.status not in CONDITION_STATUSES:
            api_error(400, "validation_error", "Invalid health context status.")
        nonce, ct = crypto.encrypt_text(
            key, json.dumps({"kind": hc.kind, "condition_name": hc.condition_name,
                             "status": hc.status})
        )
        conn.execute(
            "INSERT INTO health_context(payload_enc, nonce, created_at) VALUES (?,?,?)",
            (ct, nonce, now()),
        )
    if body.enabled_categories:
        conn.execute("UPDATE symptom_category SET enabled=0")
        for key in body.enabled_categories:
            conn.execute(
                "INSERT INTO symptom_category(key, label, is_custom, enabled)"
                " VALUES (?,?,0,1) ON CONFLICT(key) DO UPDATE SET enabled=1",
                (key, key.replace("_", " ").title()),
            )
    conn.commit()
    row = conn.execute("SELECT * FROM profile WHERE id=1").fetchone()
    return {
        "profile": {
            "id": row["id"],
            "language": row["language"],
            "cycle_type": row["cycle_type"],
            "enabled_categories": json.loads(row["enabled_categories_json"]),
        }
    }


# ---------- periods ----------

class PeriodIn(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    flow_level: Optional[int] = None

    @field_validator("end_date")
    @classmethod
    def end_not_before_start(cls, v, info):
        if v is not None and info.data.get("start_date") and v < info.data["start_date"]:
            raise ValueError("end_date cannot be before start_date")
        return v


def period_json(row):
    return {
        "id": row["id"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "flow_level": row["flow_level"],
    }


def check_overlap(conn, start: str, end: str, exclude_id=None):
    sql = (
        "SELECT id FROM period WHERE NOT (COALESCE(end_date, ?) < ? OR start_date > ?)"
    )
    params = [FAR_FUTURE, start, end]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    clash = conn.execute(sql, params).fetchone()
    if clash:
        api_error(409, "overlap", "This period overlaps an existing entry (id %d)." % clash["id"])


@router.get("/periods")
def list_periods(conn=Depends(get_conn)):
    rows = conn.execute("SELECT * FROM period ORDER BY start_date").fetchall()
    return [period_json(r) for r in rows]


@router.post("/periods", status_code=201)
def create_period(body: PeriodIn, conn=Depends(get_conn)):
    s, e = body.start_date.isoformat(), (body.end_date.isoformat() if body.end_date else FAR_FUTURE)
    check_overlap(conn, s, e)
    cur = conn.execute(
        "INSERT INTO period(start_date, end_date, flow_level, created_at, updated_at)"
        " VALUES (?,?,?,?,?)",
        (s, body.end_date.isoformat() if body.end_date else None, body.flow_level, now(), now()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM period WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"period": period_json(row)}


@router.put("/periods/{period_id}")
def update_period(period_id: int, body: PeriodIn, conn=Depends(get_conn)):
    if not conn.execute("SELECT 1 FROM period WHERE id=?", (period_id,)).fetchone():
        api_error(404, "not_found", "Period not found.")
    s, e = body.start_date.isoformat(), (body.end_date.isoformat() if body.end_date else FAR_FUTURE)
    check_overlap(conn, s, e, exclude_id=period_id)
    conn.execute(
        "UPDATE period SET start_date=?, end_date=?, flow_level=?, updated_at=? WHERE id=?",
        (s, body.end_date.isoformat() if body.end_date else None, body.flow_level, now(), period_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM period WHERE id=?", (period_id,)).fetchone()
    return {"period": period_json(row)}


@router.delete("/periods/{period_id}", status_code=204)
def delete_period(period_id: int, conn=Depends(get_conn)):
    cur = conn.execute("DELETE FROM period WHERE id=?", (period_id,))
    conn.commit()
    if cur.rowcount == 0:
        api_error(404, "not_found", "Period not found.")


# ---------- daily logs ----------

class LogIn(BaseModel):
    date: date
    category: str
    value: Optional[str] = None
    note: Optional[str] = None


@router.get("/logs")
def get_logs(date: date, conn=Depends(get_conn)):
    key = crypto.app_key()
    rows = conn.execute(
        "SELECT l.id, l.date, c.key AS category, l.value, l.note_enc, l.nonce"
        " FROM daily_log l JOIN symptom_category c ON c.id = l.category_id"
        " WHERE l.date = ? ORDER BY c.key",
        (date.isoformat(),),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "date": r["date"],
            "category": r["category"],
            "value": r["value"],
            "note": crypto.decrypt_text(key, r["nonce"], r["note_enc"]) if r["note_enc"] else None,
        }
        for r in rows
    ]


@router.post("/logs", status_code=201)
def create_log(body: LogIn, conn=Depends(get_conn)):
    cat = conn.execute(
        "SELECT id, enabled FROM symptom_category WHERE key=?", (body.category,)
    ).fetchone()
    if not cat:
        api_error(404, "not_found", "Unknown symptom category '%s'." % body.category)
    if not cat["enabled"]:
        api_error(400, "category_disabled", "Category '%s' is disabled." % body.category)
    key = crypto.app_key()
    nonce, ct = crypto.encrypt_text(key, body.note) if body.note else (None, None)
    conn.execute(
        "INSERT INTO daily_log(date, category_id, value, note_enc, nonce) VALUES (?,?,?,?,?)"
        " ON CONFLICT(date, category_id) DO UPDATE SET value=excluded.value,"
        " note_enc=excluded.note_enc, nonce=excluded.nonce",
        (body.date.isoformat(), cat["id"], body.value, ct, nonce),
    )
    conn.commit()
    return get_logs(date=body.date, conn=conn)


# ---------- categories ----------

class CategoryUpdate(BaseModel):
    key: str
    enabled: bool


class CategoryAdd(BaseModel):
    key: str
    label: str


class CategoriesIn(BaseModel):
    updates: list[CategoryUpdate] = []
    add: list[CategoryAdd] = []


@router.get("/categories")
def list_categories(conn=Depends(get_conn)):
    rows = conn.execute(
        "SELECT key, label, is_custom, enabled FROM symptom_category ORDER BY id"
    ).fetchall()
    return [
        {"key": r["key"], "label": r["label"], "is_custom": bool(r["is_custom"]), "enabled": bool(r["enabled"])}
        for r in rows
    ]


@router.put("/categories")
def update_categories(body: CategoriesIn, conn=Depends(get_conn)):
    for u in body.updates:
        conn.execute("UPDATE symptom_category SET enabled=? WHERE key=?", (int(u.enabled), u.key))
    for a in body.add:
        conn.execute(
            "INSERT INTO symptom_category(key, label, is_custom, enabled) VALUES (?,?,1,1)"
            " ON CONFLICT(key) DO UPDATE SET label=excluded.label, enabled=1",
            (a.key, a.label),
        )
    conn.commit()
    return list_categories(conn)


# ---------- notes ----------

class NoteIn(BaseModel):
    date: Optional[dt_date] = None
    text: str


@router.get("/notes")
def list_notes(date: Optional[dt_date] = None, conn=Depends(get_conn)):
    key = crypto.app_key()
    if date:
        rows = conn.execute("SELECT * FROM note WHERE date=? ORDER BY id", (date.isoformat(),)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM note ORDER BY date, id").fetchall()
    return [
        {"id": r["id"], "date": r["date"], "text": crypto.decrypt_text(key, r["nonce"], r["text_enc"]), "created_at": r["created_at"]}
        for r in rows
    ]


@router.post("/notes", status_code=201)
def create_note(body: NoteIn, conn=Depends(get_conn)):
    key = crypto.app_key()
    nonce, ct = crypto.encrypt_text(key, body.text)
    cur = conn.execute(
        "INSERT INTO note(date, text_enc, nonce, created_at) VALUES (?,?,?,?)",
        (body.date.isoformat() if body.date else None, ct, nonce, now()),
    )
    conn.commit()
    return {"note": {"id": cur.lastrowid, "date": body.date.isoformat() if body.date else None, "text": body.text}}


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, conn=Depends(get_conn)):
    cur = conn.execute("DELETE FROM note WHERE id=?", (note_id,))
    conn.commit()
    if cur.rowcount == 0:
        api_error(404, "not_found", "Note not found.")


# ---------- sexual activity (optional, encrypted) ----------

class ActivityIn(BaseModel):
    date: date
    contraception: Optional[Literal["condom", "pills", "other", "none", "not_sure"]] = None
    note: Optional[str] = None


@router.get("/activity")
def list_activity(conn=Depends(get_conn)):
    key = crypto.app_key()
    rows = conn.execute("SELECT * FROM sexual_activity ORDER BY created_at").fetchall()
    out = []
    for r in rows:
        payload = json.loads(crypto.decrypt_text(key, r["nonce"], r["payload_enc"]))
        out.append({"id": r["id"], **payload})
    out.sort(key=lambda a: a.get("date") or "")
    return out


@router.post("/activity", status_code=201)
def create_activity(body: ActivityIn, conn=Depends(get_conn)):
    key = crypto.app_key()
    payload = {
        "date": body.date.isoformat(),
        "contraception": body.contraception,
        "note": body.note,
    }
    nonce, ct = crypto.encrypt_text(key, json.dumps(payload))
    cur = conn.execute(
        "INSERT INTO sexual_activity(payload_enc, nonce, created_at) VALUES (?,?,?)",
        (ct, nonce, now()),
    )
    conn.commit()
    return {"id": cur.lastrowid, **payload}


@router.delete("/activity/{activity_id}", status_code=204)
def delete_activity(activity_id: int, conn=Depends(get_conn)):
    cur = conn.execute("DELETE FROM sexual_activity WHERE id=?", (activity_id,))
    conn.commit()
    if cur.rowcount == 0:
        api_error(404, "not_found", "Entry not found.")


# ---------- contraception preference ----------

class ContraceptionIn(BaseModel):
    uses_pills: bool
    method: Optional[str] = None


@router.get("/contraception")
def get_contraception(conn=Depends(get_conn)):
    row = conn.execute("SELECT * FROM contraception_pref WHERE id=1").fetchone()
    if not row or not row["payload_enc"]:
        return {"uses_pills": None, "method": None}
    payload = json.loads(
        crypto.decrypt_text(crypto.app_key(), row["nonce"], row["payload_enc"])
    )
    return {"uses_pills": payload.get("uses_pills"), "method": payload.get("method")}


@router.put("/contraception")
def put_contraception(body: ContraceptionIn, conn=Depends(get_conn)):
    nonce, ct = crypto.encrypt_text(
        crypto.app_key(),
        json.dumps({"uses_pills": body.uses_pills, "method": body.method}),
    )
    conn.execute(
        "INSERT INTO contraception_pref(id, payload_enc, nonce, updated_at) VALUES (1,?,?,?)"
        " ON CONFLICT(id) DO UPDATE SET payload_enc=excluded.payload_enc,"
        " nonce=excluded.nonce, updated_at=excluded.updated_at",
        (ct, nonce, now()),
    )
    conn.commit()
    return get_contraception(conn)
