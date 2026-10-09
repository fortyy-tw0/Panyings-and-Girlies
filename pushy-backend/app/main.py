import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db
from .prediction import router as prediction_router
from .privacy import router as privacy_router
from .privacy import service as privacy_service
from .records import router as records_router
from .reminders import router as reminders_router

app = FastAPI(title="Pu-shy Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "validation_error", "message": str(exc)}},
    )


@app.exception_handler(HTTPException)
async def http_exc_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "error", "message": str(exc.detail)}},
    )


LOCK_EXEMPT_PATHS = {"/health", "/unlock", "/docs", "/openapi.json"}


@app.middleware("http")
async def lock_guard(request: Request, call_next):
    if privacy_service.is_locked() and request.url.path not in LOCK_EXEMPT_PATHS:
        return JSONResponse(
            status_code=423,
            content={"error": {"code": "locked", "message": "App is locked."}},
        )
    return await call_next(request)


@app.on_event("startup")
def startup():
    db.init_db()
    conn = db.connect()
    try:
        privacy_service.load_lock_state(conn)
    finally:
        conn.close()


app.include_router(records_router)
app.include_router(prediction_router)
app.include_router(reminders_router)
app.include_router(privacy_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "offline": True,
        "db": "ok",
        "model_loaded": bool(os.environ.get("PUSHY_MODEL_PATH")),
    }
