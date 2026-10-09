import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import crypto, db
from . import service

router = APIRouter()


def get_conn():
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


def err(status, code, message):
    raise HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


@router.get("/storage")
def storage():
    return service.storage_report()


@router.get("/export")
def export(conn=Depends(get_conn)):
    return service.export_data(conn)


class PassphraseIn(BaseModel):
    passphrase: str


class RestoreIn(BaseModel):
    passphrase: str
    path: str


@router.post("/backup")
def backup(body: PassphraseIn, conn=Depends(get_conn)):
    if not body.passphrase:
        err(400, "validation_error", "A passphrase is required to encrypt the backup.")
    path = service.make_backup(conn, body.passphrase)
    return {"path": path, "bytes": os.path.getsize(path)}


@router.post("/restore")
def restore(body: RestoreIn, conn=Depends(get_conn)):
    if not os.path.exists(body.path):
        err(404, "not_found", "Backup file not found.")
    try:
        data = service.read_backup(body.path, body.passphrase)
    except crypto.WrongPassphrase:
        err(400, "bad_passphrase", "Wrong passphrase — backup could not be decrypted.")
    except (ValueError, KeyError) as e:
        err(400, "invalid_backup", str(e))
    service.import_data(conn, data)
    return {"restored": True}


class DeleteAllIn(BaseModel):
    delete_model: bool = False


@router.delete("/all", status_code=204)
def delete_all(body: Optional[DeleteAllIn] = None, conn=Depends(get_conn)):
    service.wipe_user_data(conn)
    try:
        from ..companion import sessions  # B2 module — clears in-memory chats if present
        sessions.clear()
    except ImportError:
        pass
    if body and body.delete_model:
        model = os.environ.get("PUSHY_MODEL_PATH")
        if model and os.path.exists(model):
            os.remove(model)


@router.post("/lock")
def lock(body: PassphraseIn, conn=Depends(get_conn)):
    if not body.passphrase:
        err(400, "validation_error", "A passphrase is required.")
    conn.execute(
        "UPDATE profile SET app_lock_hash=? WHERE id=1",
        (crypto.hash_passphrase(body.passphrase),),
    )
    conn.commit()
    service.set_locked(True)
    return {"locked": True}


@router.post("/unlock")
def unlock(body: PassphraseIn, conn=Depends(get_conn)):
    row = conn.execute("SELECT app_lock_hash FROM profile WHERE id=1").fetchone()
    if not row or not row["app_lock_hash"]:
        return {"unlocked": True}
    if not crypto.verify_passphrase(body.passphrase, row["app_lock_hash"]):
        err(400, "bad_passphrase", "Wrong passphrase.")
    service.set_locked(False)
    return {"unlocked": True}
