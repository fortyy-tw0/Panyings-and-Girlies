from fastapi import HTTPException


def api_error(status: int, code: str, message: str) -> None:
    raise HTTPException(
        status_code=status,
        detail={"error": {"code": code, "message": message}},
    )
