"""Prediction & Insights Engine — deterministic math only.

The LLM never does the math; it only verbalizes what these functions return.
Nothing is cached: every call recomputes from the period table, so edited or
deleted history takes effect immediately. Irregular data widens the window /
lowers confidence — it is never reported as a user error.
"""

from datetime import date, timedelta
from statistics import median

MIN_CYCLE_DAYS = 15
MAX_CYCLE_DAYS = 90
RECENT_CYCLES = 6
HIGH_VARIABILITY_SPREAD = 8
CHANGE_THRESHOLD_DAYS = 7
MIN_CYCLES_FOR_PREDICTION = 3

FLAG_MESSAGES = {
    "missing_data": (
        "Some period dates may be missing between these records. "
        "You can review your history if that seems right."
    ),
    "high_variability": (
        "Your recorded cycle lengths have varied considerably. "
        "This observation alone cannot determine whether you have PCOS or "
        "another condition. A qualified healthcare professional can help "
        "evaluate persistent concerns."
    ),
    "change_detected": (
        "Your latest cycle length differed noticeably from your previous "
        "pattern. Changes can have many possible causes; a healthcare "
        "professional can help evaluate persistent concerns."
    ),
}

FORMULA = (
    "median of your last {n} recorded cycle lengths, counted start-date "
    "to start-date. The window spans your shortest to longest recent cycle."
)


def _parse(d):
    return d if isinstance(d, date) else date.fromisoformat(d)


def compute(periods):
    """periods: iterable of dicts/rows with start_date, end_date (None = ongoing)."""
    starts = sorted({_parse(p["start_date"]) for p in periods})
    cycles = [
        {"from": starts[i], "to": starts[i + 1], "length": (starts[i + 1] - starts[i]).days}
        for i in range(len(starts) - 1)
    ]
    valid = [c for c in cycles if MIN_CYCLE_DAYS <= c["length"] <= MAX_CYCLE_DAYS]
    excluded = [c for c in cycles if c not in valid]

    durations = [
        (_parse(p["end_date"]) - _parse(p["start_date"])).days + 1
        for p in periods
        if p["end_date"]
    ]
    expected_duration = int(round(median(durations))) if durations else None

    flags = ["missing_data"] if excluded else []
    result = {
        "status": "need_more_history",
        "estimate": None,
        "window": None,
        "confidence": None,
        "expected_duration": expected_duration,
        "cycles_used": len(valid),
        "median_cycle_len": None,
        "cycle_range": None,
        "flags": flags,
    }
    if len(valid) < MIN_CYCLES_FOR_PREDICTION:
        result["explanation"] = _explain(starts, cycles, valid, 0)
        return result

    recent = valid[-RECENT_CYCLES:]
    lengths = [c["length"] for c in recent]
    med = int(round(median(lengths)))
    min_len, max_len = min(lengths), max(lengths)
    spread = max_len - min_len
    last_start = starts[-1]

    if spread <= 4:
        confidence = "high"
    elif spread <= 8:
        confidence = "medium"
    else:
        confidence = "low"

    if spread > HIGH_VARIABILITY_SPREAD:
        flags.append("high_variability")

    previous = [c["length"] for c in valid[:-1]]
    if previous and abs(lengths[-1] - median(previous)) > CHANGE_THRESHOLD_DAYS:
        flags.append("change_detected")

    result.update(
        status="ok",
        estimate=(last_start + timedelta(days=med)).isoformat(),
        window=[
            (last_start + timedelta(days=min_len)).isoformat(),
            (last_start + timedelta(days=max_len)).isoformat(),
        ],
        confidence=confidence,
        median_cycle_len=med,
        cycle_range=[min_len, max_len],
        explanation=_explain(starts, cycles, valid, len(recent)),
    )
    return result


def _explain(starts, cycles, valid, recent_count):
    return {
        "dates_used": [s.isoformat() for s in starts],
        "cycle_lengths": [
            {
                "from": c["from"].isoformat(),
                "to": c["to"].isoformat(),
                "length": c["length"],
                "used": c in valid[-recent_count:] if recent_count else c in valid,
                "excluded_as_gap": c not in valid,
            }
            for c in cycles
        ],
        "formula": FORMULA.format(n=max(recent_count, MIN_CYCLES_FOR_PREDICTION)),
    }


def flag_messages(flags):
    return [{"key": f, "message": FLAG_MESSAGES[f]} for f in flags]


def symptom_patterns(conn, periods, min_cycles=2, early_days=(1, 2)):
    """Count, per symptom category, in how many cycles it was logged on
    cycle days 1-2 (day 1 = period start). Simple counts — no inference."""
    starts = sorted({_parse(p["start_date"]) for p in periods})
    if len(starts) < 2:
        return []
    bounds = [(starts[i], starts[i + 1]) for i in range(len(starts) - 1)]

    rows = conn.execute(
        "SELECT l.date, c.key FROM daily_log l"
        " JOIN symptom_category c ON c.id = l.category_id"
    ).fetchall()

    hits = {}
    for r in rows:
        d = _parse(r["date"])
        for i, (s, e) in enumerate(bounds):
            day = (d - s).days + 1
            if s <= d < e and day in early_days:
                hits.setdefault(r["key"], set()).add(i)
    patterns = [
        {"category": k, "cycle_days": list(early_days), "cycles": len(v), "of_cycles": len(bounds)}
        for k, v in hits.items()
        if len(v) >= min_cycles
    ]
    patterns.sort(key=lambda p: -p["cycles"])
    return patterns[:5]


def get_stats_for_ai(conn):
    """Compact stats JSON for the Companion (B2). ~150 tokens, ~14 fields.
    The LLM only verbalizes these numbers — it never sees raw logs."""
    periods = conn.execute("SELECT start_date, end_date FROM period").fetchall()
    p = compute(periods)
    return {
        "cycles_used": p["cycles_used"],
        "median_cycle_len": p["median_cycle_len"],
        "cycle_range": p["cycle_range"],
        "last_period_start": max((r["start_date"] for r in periods), default=None),
        "next_estimate": p["estimate"],
        "window": p["window"],
        "confidence": p["confidence"],
        "expected_duration_days": p["expected_duration"],
        "flags": p["flags"],
        "top_symptoms": [
            {"category": s["category"], "cycle_days": s["cycle_days"], "cycles": s["cycles"]}
            for s in symptom_patterns(conn, periods)
        ][:3],
    }
