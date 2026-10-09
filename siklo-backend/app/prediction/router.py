"""Prediction & Insights endpoints — thin wrappers over engine.compute()."""

from fastapi import APIRouter, Depends

from ..core.dependencies import get_conn
from . import engine

router = APIRouter()


def _periods(conn):
    return conn.execute("SELECT start_date, end_date FROM period").fetchall()


@router.get("/predictions/next")
def next_prediction(conn=Depends(get_conn)):
    r = engine.compute(_periods(conn))
    r.pop("explanation", None)
    return r


@router.get("/predictions/explain")
def explain(conn=Depends(get_conn)):
    r = engine.compute(_periods(conn))
    ex = r.get("explanation") or {}
    ex["status"] = r["status"]
    ex["estimate"] = r["estimate"]
    ex["window"] = r["window"]
    ex["confidence"] = r["confidence"]
    return ex


@router.get("/insights")
def insights(conn=Depends(get_conn)):
    periods = _periods(conn)
    r = engine.compute(periods)
    return {
        "status": r["status"],
        "cycles_used": r["cycles_used"],
        "median_cycle_len": r["median_cycle_len"],
        "cycle_range": r["cycle_range"],
        "confidence": r["confidence"],
        "expected_duration": r["expected_duration"],
        "pattern_flags": engine.flag_messages(r["flags"]),
        "symptom_patterns": engine.symptom_patterns(conn, periods),
    }
