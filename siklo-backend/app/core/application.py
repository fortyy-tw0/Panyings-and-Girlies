import os
import secrets

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .. import db, llm
from ..companion import router as companion_router
from ..prediction import router as prediction_router
from ..privacy import router as privacy_router
from ..privacy import service as privacy_service
from ..records import router as records_router
from ..reminders import router as reminders_router

LOCK_EXEMPT_PATHS = {"/health", "/unlock", "/docs", "/openapi.json"}
# The docs page can't send a token, and browsers send OPTIONS "preflight" requests without one.
TOKEN_EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


def create_app() -> FastAPI:
    app = FastAPI(title="SikLo Backend", version="0.2.0")

    configure_middleware(app)
    configure_exception_handlers(app)
    configure_lifecycle(app)
    include_routers(app)

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "offline": True,
            "db": "ok",
            "model_loaded": llm.is_model_ready(),
        }

    return app


def configure_middleware(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def lock_guard(request: Request, call_next):
        if privacy_service.is_locked() and request.url.path not in LOCK_EXEMPT_PATHS:
            return JSONResponse(
                status_code=423,
                content={"error": {"code": "locked", "message": "App is locked."}},
            )
        return await call_next(request)

    @app.middleware("http")
    async def token_guard(request: Request, call_next):
        # CORS alone does not stop other local programs calling 127.0.0.1.
        # The per-launch bearer token is never written to disk; PUSHY_API_TOKEN
        # overrides it for dev/tests.
        if request.method == "OPTIONS" or request.url.path in TOKEN_EXEMPT_PATHS:
            return await call_next(request)
        expected = getattr(app.state, "api_token", None) or os.environ.get(
            "PUSHY_API_TOKEN"
        )
        if expected and request.headers.get("authorization") != f"Bearer {expected}":
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "unauthorized",
                        "message": "Missing or wrong API token.",
                    }
                },
            )
        return await call_next(request)


def configure_exception_handlers(app: FastAPI) -> None:
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


def configure_lifecycle(app: FastAPI) -> None:
    @app.on_event("startup")
    def startup():
        db.init_db()
        app.state.api_token = os.environ.get("PUSHY_API_TOKEN") or secrets.token_urlsafe(
            32
        )
        print("SikLo API token (hand to the frontend):", app.state.api_token)
        conn = db.connect()
        try:
            privacy_service.load_lock_state(conn)
        finally:
            conn.close()


def include_routers(app: FastAPI) -> None:
    app.include_router(records_router)
    app.include_router(prediction_router)
    app.include_router(reminders_router)
    app.include_router(privacy_router)
    app.include_router(companion_router)
