"""
Companion chat endpoints (backend plan v2.1, Section 4: "Companion — sessions in RAM").

POST   /chat/sessions                      {mode?}        -> {session_id}
GET    /chat/sessions                                     -> [{session_id, mode, created_at}]
POST   /chat/sessions/{id}/messages        {text, mode?}  -> {reply, intent, sources[], needs_consent}
GET    /chat/sessions/{id}/messages                       -> [{role, text, sources[]}]
POST   /chat/sessions/{id}/consent                        -> {records_consent: true}
DELETE /chat/sessions/{id}                                -> 204
"""
import json
import re
from sqlite3 import Connection
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from .. import llm
from ..core.dependencies import get_conn
from ..core.errors import api_error
from ..library import search
from . import prompts, safety, store

router = APIRouter(prefix="/chat", tags=["companion"])

Mode = Literal["listen", "records", "learn"]


class NewSession(BaseModel):
    mode: Mode | None = None


class NewMessage(BaseModel):
    text: str
    mode: Mode | None = None


# ---------- intent routing (the UI mode toggle overrides this) ----------

RECORDS_HINTS = r"\b(my (cycle|period|periods|records|data|pattern|patterns|log|logs)|next period|when (is|will) my|am i late|late ba|kailan.*(regla|period))\b"
LISTEN_HINTS = r"\b(feel|feeling|sad|tired|stressed|angry|annoyed|hate|ugh|rant|vent|crying|lonely|pagod|malungkot|inis|badtrip|nakakainis)\b"


def route_intent(text: str, requested: str | None) -> str:
    about_my_data = re.search(RECORDS_HINTS, text, flags=re.IGNORECASE)
    if requested == "records" and not about_my_data and search(text):
        # A general health question asked while "About my cycle" is selected:
        # answer it from the library instead of asking for consent.
        return "learn"
    if requested:
        return requested
    if re.search(RECORDS_HINTS, text, flags=re.IGNORECASE):
        return "records"
    if re.search(LISTEN_HINTS, text, flags=re.IGNORECASE):
        return "listen"
    return "learn"


# ---------- cycle stats from the Prediction module ----------

def cycle_stats(conn: Connection) -> dict | None:
    """Ask the prediction engine for its compact stats (get_stats_for_ai in the plan)."""
    try:
        from ..prediction import engine
    except Exception:
        return None
    for name in ("get_stats_for_ai", "stats_for_ai", "get_stats"):
        fn = getattr(engine, name, None)
        if not callable(fn):
            continue
        try:
            return fn(conn)
        except TypeError:
            try:
                return fn()
            except Exception:
                return None
        except Exception:
            return None
    return None


# ---------- endpoints ----------

def _session_or_404(session_id: str) -> store.Session:
    session = store.get(session_id)
    if session is None:
        api_error(404, "session_not_found", "This chat has ended. Start a new one.")
    return session


@router.post("/sessions")
def create_session(body: NewSession | None = None):
    session = store.create(mode=(body.mode if body and body.mode else "learn"))
    return {"session_id": session.id}


@router.get("/sessions")
def list_sessions():
    return [
        {"session_id": s.id, "mode": s.mode, "created_at": s.created_at}
        for s in store.all_sessions()
    ]


@router.get("/sessions/{session_id}/messages")
def get_messages(session_id: str):
    return _session_or_404(session_id).messages


@router.post("/sessions/{session_id}/consent")
def give_consent(session_id: str):
    _session_or_404(session_id).records_consent = True
    return {"records_consent": True}


@router.delete("/sessions/{session_id}", status_code=204)
def end_session(session_id: str):
    store.delete(session_id)
    return Response(status_code=204)


@router.post("/sessions/{session_id}/messages")
def send_message(session_id: str, body: NewMessage, conn: Connection = Depends(get_conn)):
    session = _session_or_404(session_id)
    text = body.text.strip()
    if not text:
        api_error(400, "empty_message", "Type a message first.")

    # (a) safety pre-check: fixed replies, the AI is not called
    category = safety.pre_check(text)
    if category:
        reply = safety.FIXED_REPLIES[category]
        store.add_message(session, "user", text)
        store.add_message(session, "assistant", reply)
        return {"reply": reply, "intent": "safety", "sources": [], "needs_consent": False}

    # (b) intent
    intent = route_intent(text, body.mode)
    history = store.history_for_ai(session)
    sources: list[dict] = []
    needs_consent = False

    # (c) mode handlers
    if intent == "listen":
        reply = llm.generate(prompts.LISTEN, [*history, {"role": "user", "content": text}], temperature=0.7)

    elif intent == "records":
        if not session.records_consent:
            reply, needs_consent = prompts.CONSENT_REQUEST, True
        else:
            stats = cycle_stats(conn)
            if not stats:
                reply = prompts.NO_STATS_REPLY
            else:
                system = prompts.RECORDS.format(stats=json.dumps(stats, default=str)[:1500])
                reply = llm.generate(system, [*history, {"role": "user", "content": text}], temperature=0.3)

    else:  # learn
        hits = search(text)
        if not hits:
            reply = prompts.NO_SOURCE_REPLY
        else:
            passage = hits[0]
            system = prompts.LEARN.format(title=passage["title"], text=passage["text"])
            reply = llm.generate(system, [*history, {"role": "user", "content": text}], temperature=0.3)
            sources = [{"title": passage["title"], "source": passage["source"]}]

    # (d) safety post-check
    reply = safety.post_check(reply)

    # (e) keep in RAM only
    store.add_message(session, "user", text)
    store.add_message(session, "assistant", reply, sources)
    return {"reply": reply, "intent": intent, "sources": sources, "needs_consent": needs_consent}
