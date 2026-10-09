"""
In-memory chat sessions (RAM only, by design).
Nothing here is ever written to disk, logs, or backups. Restarting the backend wipes every chat.
"""
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

MAX_HISTORY = 10  # messages kept per session for the AI prompt


@dataclass
class Session:
    id: str
    mode: str
    created_at: str
    records_consent: bool = False
    messages: list[dict] = field(default_factory=list)  # {"role", "text", "sources"}
    pending_records_question: str | None = None


_sessions: dict[str, Session] = {}
_lock = threading.Lock()


def create(mode: str) -> Session:
    session = Session(
        id=uuid.uuid4().hex,
        mode=mode,
        created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    with _lock:
        _sessions[session.id] = session
    return session


def get(session_id: str) -> Session | None:
    with _lock:
        return _sessions.get(session_id)


def delete(session_id: str) -> bool:
    with _lock:
        return _sessions.pop(session_id, None) is not None


def all_sessions() -> list[Session]:
    with _lock:
        return list(_sessions.values())


def clear() -> None:
    """Used by DELETE /all (wipe everything)."""
    with _lock:
        _sessions.clear()


def add_message(session: Session, role: str, text: str, sources: list | None = None) -> None:
    session.messages.append({"role": role, "text": text, "sources": sources or []})


def history_for_ai(session: Session) -> list[dict]:
    """Last few messages in the format Ollama expects."""
    recent = session.messages[-MAX_HISTORY:]
    return [{"role": m["role"], "content": m["text"]} for m in recent]
