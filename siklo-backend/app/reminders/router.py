import json
from datetime import datetime, timedelta
from datetime import time as dt_time
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator

from .. import crypto
from ..core.dependencies import get_conn
from ..core.errors import api_error
from . import service

router = APIRouter()


def _now(at: Optional[datetime]) -> datetime:
    return at or datetime.now()


# ---------- pill reminder ----------

class PillReminderIn(BaseModel):
    enabled: bool
    time_local: str
    discreet_text: Optional[str] = None
    paused: bool = False

    @field_validator("time_local")
    @classmethod
    def valid_time(cls, v):
        try:
            dt_time.fromisoformat(v)
        except ValueError:
            raise ValueError("time_local must be 'HH:MM'")
        return v


@router.get("/reminders/pill")
def get_pill(conn=Depends(get_conn)):
    r = service.get_pill_reminder(conn)
    if not r:
        return {"enabled": False, "time_local": None, "discreet_text": None, "paused": False}
    return r


@router.put("/reminders/pill")
def put_pill(body: PillReminderIn, conn=Depends(get_conn)):
    nonce, ct = crypto.encrypt_text(
        crypto.app_key(),
        json.dumps({"time_local": body.time_local, "discreet_text": body.discreet_text}),
    )
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO pill_reminder(id, enabled, paused, payload_enc, nonce,"
        " created_at, updated_at) VALUES (1,?,?,?,?,?,?)"
        " ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,"
        " paused=excluded.paused, payload_enc=excluded.payload_enc,"
        " nonce=excluded.nonce, updated_at=excluded.updated_at",
        (int(body.enabled), int(body.paused), ct, nonce, now, now),
    )
    service.clear_pending_pill_events(conn)  # regenerate at the new time
    conn.commit()
    return get_pill(conn)


# ---------- events ----------

@router.get("/reminders/due")
def due(at: Optional[datetime] = None, conn=Depends(get_conn)):
    return service.due_events(conn, _now(at))


class RespondIn(BaseModel):
    status: Literal["taken", "skipped"]


@router.post("/reminders/events/{event_id}/respond")
def respond(event_id: int, body: RespondIn, conn=Depends(get_conn)):
    r = service.respond(conn, event_id, body.status)
    if r is None:
        api_error(404, "not_found", "Reminder event not found.")
    return {"event_id": event_id, "status": body.status}


@router.get("/reminders/history")
def history(days: int = 30, conn=Depends(get_conn)):
    since = (datetime.now() - timedelta(days=days)).isoformat(timespec="seconds")
    rows = conn.execute(
        "SELECT * FROM reminder_event WHERE scheduled_for >= ? ORDER BY scheduled_for DESC",
        (since,),
    ).fetchall()
    return [
        {"id": r["id"], "type": service.event_type(r), "scheduled_for": r["scheduled_for"],
         "status": r["status"], "responded_at": r["responded_at"]}
        for r in rows
    ]


# ---------- pregnancy-test reminders (optional, user-set) ----------

class PregnancyTestIn(BaseModel):
    date: str
    note: Optional[str] = None

    @field_validator("date")
    @classmethod
    def valid_date(cls, v):
        datetime.strptime(v, "%Y-%m-%d")
        return v


def _pt_json(conn, r):
    key = crypto.app_key()
    return {
        "id": r["id"],
        "date": r["date"],
        "note": crypto.decrypt_text(key, r["nonce"], r["note_enc"]) if r["note_enc"] else None,
        "done": bool(r["done"]),
    }


@router.get("/reminders/pregnancy-test")
def list_pt(conn=Depends(get_conn)):
    rows = conn.execute("SELECT * FROM pregnancy_test_reminder ORDER BY date").fetchall()
    return [_pt_json(conn, r) for r in rows]


@router.post("/reminders/pregnancy-test", status_code=201)
def create_pt(body: PregnancyTestIn, conn=Depends(get_conn)):
    key = crypto.app_key()
    nonce, ct = crypto.encrypt_text(key, body.note) if body.note else (None, None)
    cur = conn.execute(
        "INSERT INTO pregnancy_test_reminder(date, note_enc, nonce, created_at) VALUES (?,?,?,?)",
        (body.date, ct, nonce, datetime.now().isoformat(timespec="seconds")),
    )
    service.insert_event(
        conn, service.PREGNANCY_TEST, cur.lastrowid, body.date + "T09:00:00"
    )
    conn.commit()
    r = conn.execute(
        "SELECT * FROM pregnancy_test_reminder WHERE id=?", (cur.lastrowid,)
    ).fetchone()
    return {"reminder": _pt_json(conn, r)}


@router.delete("/reminders/pregnancy-test/{reminder_id}", status_code=204)
def delete_pt(reminder_id: int, conn=Depends(get_conn)):
    cur = conn.execute("DELETE FROM pregnancy_test_reminder WHERE id=?", (reminder_id,))
    # ref_id is only set on pregnancy-test events, so this needs no type check
    conn.execute(
        "DELETE FROM reminder_event WHERE ref_id=? AND status='pending'",
        (reminder_id,),
    )
    conn.commit()
    if cur.rowcount == 0:
        api_error(404, "not_found", "Reminder not found.")
