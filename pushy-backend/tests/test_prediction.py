import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.prediction import engine


def periods(starts, duration=5, ongoing_last=False):
    from datetime import date, timedelta

    out = []
    for i, s in enumerate(starts):
        d = date.fromisoformat(s)
        end = None if (ongoing_last and i == len(starts) - 1) else (d + timedelta(days=duration - 1)).isoformat()
        out.append({"start_date": s, "end_date": end})
    return out


# spec example: cycles 27, 31, 36, 29, 34; last start Sep 28, 2025
SPEC_STARTS = ["2025-04-24", "2025-05-21", "2025-06-21", "2025-07-27", "2025-08-25", "2025-09-28"]


def test_spec_example_window_and_confidence():
    r = engine.compute(periods(SPEC_STARTS))
    assert r["status"] == "ok"
    assert r["median_cycle_len"] == 31
    assert r["window"] == ["2025-10-25", "2025-11-03"]
    assert r["estimate"] == "2025-10-29"
    assert r["confidence"] == "low"
    assert "high_variability" in r["flags"]
    assert r["expected_duration"] == 5


def test_need_more_history_under_3_cycles():
    r = engine.compute(periods(["2025-01-01", "2025-01-29"]))
    assert r["status"] == "need_more_history"
    assert r["estimate"] is None


def test_regular_cycles_high_confidence():
    starts = ["2025-01-01", "2025-01-29", "2025-02-26", "2025-03-26", "2025-04-23"]
    r = engine.compute(periods(starts))
    assert r["confidence"] == "high"
    assert r["flags"] == []


def test_long_gap_excluded_and_flagged():
    # 128-day gap must not count as a cycle, and must not blame the user
    starts = ["2025-01-01", "2025-01-29", "2025-06-06", "2025-07-04", "2025-08-01"]
    r = engine.compute(periods(starts))
    assert r["status"] == "ok"
    assert "missing_data" in r["flags"]
    assert r["median_cycle_len"] == 28


def test_sudden_change_flagged():
    starts = ["2025-01-01", "2025-01-29", "2025-02-26", "2025-03-26", "2025-04-23", "2025-06-07"]
    r = engine.compute(periods(starts))
    assert "change_detected" in r["flags"]


def test_ongoing_period_excluded_from_duration():
    r = engine.compute(periods(SPEC_STARTS, duration=5, ongoing_last=True))
    assert r["expected_duration"] == 5
    assert r["estimate"] == "2025-10-29"  # ongoing start still anchors prediction


def test_flag_messages_never_diagnose():
    msgs = engine.flag_messages(["high_variability", "change_detected", "missing_data"])
    text = " ".join(m["message"] for m in msgs)
    assert "cannot determine" in text
    assert "%" not in text


def test_endpoints(client):
    for s in SPEC_STARTS:
        client.post("/periods", json={"start_date": s, "end_date": s})
    nxt = client.get("/predictions/next").json()
    assert nxt["window"] == ["2025-10-25", "2025-11-03"]
    ex = client.get("/predictions/explain").json()
    assert len(ex["cycle_lengths"]) == 5
    ins = client.get("/insights").json()
    assert any(f["key"] == "high_variability" for f in ins["pattern_flags"])
