import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db

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


@app.on_event("startup")
def startup():
    db.init_db()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "offline": True,
        "db": "ok",
        "model_loaded": bool(os.environ.get("PUSHY_MODEL_PATH")),
    }
