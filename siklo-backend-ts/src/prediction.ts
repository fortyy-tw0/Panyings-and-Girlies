/**
 * Prediction & Insights Engine — deterministic math only, direct port of
 * the Python engine. Nothing is cached: every call recomputes from the
 * period table, so edited/deleted history takes effect immediately.
 */

import type { Db } from "./db";
import { addDays, diffDays, parseDate, toISO } from "./dates";

export const MIN_CYCLE_DAYS = 15;
export const MAX_CYCLE_DAYS = 90;
export const RECENT_CYCLES = 6;
export const HIGH_VARIABILITY_SPREAD = 8;
export const CHANGE_THRESHOLD_DAYS = 7;
export const MIN_CYCLES_FOR_PREDICTION = 3;

export const FLAG_MESSAGES: Record<string, string> = {
  missing_data:
    "Some period dates may be missing between these records. " +
    "You can review your history if that seems right.",
  high_variability:
    "Your recorded cycle lengths have varied considerably. " +
    "This observation alone cannot determine whether you have PCOS or " +
    "another condition. A qualified healthcare professional can help " +
    "evaluate persistent concerns.",
  change_detected:
    "Your latest cycle length differed noticeably from your previous " +
    "pattern. Changes can have many possible causes; a healthcare " +
    "professional can help evaluate persistent concerns.",
};

const FORMULA = (n: number) =>
  `median of your last ${n} recorded cycle lengths, counted start-date ` +
  `to start-date. The window spans your shortest to longest recent cycle.`;

export interface PeriodRow {
  start_date: string;
  end_date: string | null;
}

export interface CycleLen {
  from: string;
  to: string;
  length: number;
}

export interface Prediction {
  status: "ok" | "not_enough_information";
  estimate: string | null;
  window: [string, string] | null;
  confidence: "high" | "medium" | "low" | null;
  expected_duration: number | null;
  cycles_used: number;
  median_cycle_len: number | null;
  cycle_range: [number, number] | null;
  flags: string[];
  explanation?: {
    dates_used: string[];
    cycle_lengths: (CycleLen & { used: boolean; excluded_as_gap: boolean })[];
    formula: string;
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function compute(periods: PeriodRow[]): Prediction {
  const starts = [...new Set(periods.map((p) => p.start_date))].sort();
  const cycles: CycleLen[] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    cycles.push({
      from: starts[i],
      to: starts[i + 1],
      length: diffDays(parseDate(starts[i]), parseDate(starts[i + 1])),
    });
  }
  const valid = cycles.filter(
    (c) => c.length >= MIN_CYCLE_DAYS && c.length <= MAX_CYCLE_DAYS
  );
  const excluded = cycles.filter((c) => !valid.includes(c));

  const durations = periods
    .filter((p) => p.end_date)
    .map((p) => diffDays(parseDate(p.start_date), parseDate(p.end_date!)) + 1);
  const expectedDuration = durations.length ? Math.round(median(durations)) : null;

  const flags: string[] = excluded.length ? ["missing_data"] : [];
  const result: Prediction = {
    status: "not_enough_information",
    estimate: null,
    window: null,
    confidence: null,
    expected_duration: expectedDuration,
    cycles_used: valid.length,
    median_cycle_len: null,
    cycle_range: null,
    flags,
  };

  if (valid.length < MIN_CYCLES_FOR_PREDICTION) {
    // Fewer than three completed intervals → "Not enough information."
    // No fabricated estimate (never assume 28 days).
    result.explanation = explain(starts, cycles, valid, 0);
    return result;
  }

  const recent = valid.slice(-RECENT_CYCLES);
  const lengths = recent.map((c) => c.length);
  const med = Math.round(median(lengths));
  const minLen = Math.min(...lengths);
  const maxLen = Math.max(...lengths);
  const spread = maxLen - minLen;
  const lastStart = parseDate(starts[starts.length - 1]);

  const confidence = spread <= 4 ? "high" : spread <= 8 ? "medium" : "low";
  if (spread > HIGH_VARIABILITY_SPREAD) flags.push("high_variability");

  const previous = valid.slice(0, -1).map((c) => c.length);
  if (previous.length && Math.abs(lengths[lengths.length - 1] - median(previous)) > CHANGE_THRESHOLD_DAYS) {
    flags.push("change_detected");
  }

  return {
    ...result,
    status: "ok",
    estimate: toISO(addDays(lastStart, med)),
    window: [toISO(addDays(lastStart, minLen)), toISO(addDays(lastStart, maxLen))],
    confidence,
    median_cycle_len: med,
    cycle_range: [minLen, maxLen],
    explanation: explain(starts, cycles, valid, recent.length),
  };
}

function explain(starts: string[], cycles: CycleLen[], valid: CycleLen[], recentCount: number) {
  const recent = recentCount ? valid.slice(-recentCount) : valid;
  return {
    dates_used: starts,
    cycle_lengths: cycles.map((c) => ({
      ...c,
      used: recent.includes(c),
      excluded_as_gap: !valid.includes(c),
    })),
    formula: FORMULA(Math.max(recentCount, MIN_CYCLES_FOR_PREDICTION)),
  };
}

export function flagMessages(flags: string[]): { key: string; message: string }[] {
  return flags.map((key) => ({ key, message: FLAG_MESSAGES[key] }));
}

export interface SymptomPattern {
  category: string;
  cycle_days: number[];
  cycles: number;
  of_cycles: number;
}

/** Per symptom category, in how many cycles it was logged on days 1-2. */
export function symptomPatterns(
  db: Db,
  periods: PeriodRow[],
  minCycles = 2,
  earlyDays: number[] = [1, 2]
): SymptomPattern[] {
  const starts = [...new Set(periods.map((p) => p.start_date))].sort();
  if (starts.length < 2) return [];
  const bounds: [Date, Date][] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    bounds.push([parseDate(starts[i]), parseDate(starts[i + 1])]);
  }

  const rows = db.all<{ date: string; key: string }>(
    "SELECT l.date, c.key FROM daily_log l JOIN symptom_category c ON c.id = l.category_id"
  );

  const hits = new Map<string, Set<number>>();
  for (const r of rows) {
    const d = parseDate(r.date);
    bounds.forEach(([s, e], i) => {
      const day = diffDays(s, d) + 1;
      if (d >= s && d < e && earlyDays.includes(day)) {
        if (!hits.has(r.key)) hits.set(r.key, new Set());
        hits.get(r.key)!.add(i);
      }
    });
  }

  return [...hits.entries()]
    .filter(([, v]) => v.size >= minCycles)
    .map(([category, v]) => ({
      category,
      cycle_days: earlyDays,
      cycles: v.size,
      of_cycles: bounds.length,
    }))
    .sort((a, b) => b.cycles - a.cycles)
    .slice(0, 5);
}

/** Compact stats JSON for the Companion (B2). ~150 tokens, ~14 fields. */
export function getStatsForAi(db: Db) {
  const periods = db.all<PeriodRow>(
    "SELECT start_date, end_date FROM period WHERE kind='period'"
  );
  const p = compute(periods);
  const lastStart = periods.length
    ? periods.map((r) => r.start_date).sort().at(-1)!
    : null;

  // Current cycle position for the companion's CycleSummary.
  let cycleDay: number | null = null;
  let phase: string | null = null;
  if (lastStart) {
    const today = new Date();
    cycleDay = diffDays(parseDate(lastStart), today) + 1;
    const last = periods.find((r) => r.start_date === lastStart);
    const inPeriod =
      last && (!last.end_date || toISO(today) <= last.end_date);
    if (inPeriod) {
      phase = "menstrual";
    } else if (p.estimate) {
      const untilEst = diffDays(today, parseDate(p.estimate));
      if (untilEst >= 12 && untilEst <= 16) phase = "ovulatory";
      else if (untilEst > 16) phase = "follicular";
      else phase = "luteal";
    }
  }

  return {
    cycles_used: p.cycles_used,
    median_cycle_len: p.median_cycle_len,
    cycle_range: p.cycle_range,
    last_period_start: lastStart,
    cycle_day: cycleDay,
    phase,
    next_estimate: p.estimate,
    window: p.window,
    confidence: p.confidence,
    expected_duration_days: p.expected_duration,
    flags: p.flags,
    top_symptoms: symptomPatterns(db, periods)
      .slice(0, 3)
      .map((s) => ({ category: s.category, cycle_days: s.cycle_days, cycles: s.cycles })),
  };
}
