import { describe, expect, it } from "vitest";
import { compute, flagMessages, type PeriodRow } from "../src/prediction";

const SPEC_STARTS = [
  "2025-04-24", "2025-05-21", "2025-06-21",
  "2025-07-27", "2025-08-25", "2025-09-28",
];

function periods(starts: string[], duration = 5, ongoingLast = false): PeriodRow[] {
  return starts.map((s, i) => {
    const end =
      ongoingLast && i === starts.length - 1
        ? null
        : new Date(new Date(s + "T00:00:00Z").getTime() + (duration - 1) * 86400000)
            .toISOString()
            .slice(0, 10);
    return { start_date: s, end_date: end };
  });
}

describe("prediction engine", () => {
  it("spec example: window Oct 25 – Nov 3, low confidence", () => {
    const r = compute(periods(SPEC_STARTS));
    expect(r.status).toBe("ok");
    expect(r.median_cycle_len).toBe(31);
    expect(r.window).toEqual(["2025-10-25", "2025-11-03"]);
    expect(r.estimate).toBe("2025-10-29");
    expect(r.confidence).toBe("low");
    expect(r.flags).toContain("high_variability");
    expect(r.expected_duration).toBe(5);
  });

  it("2 starts (1 interval) → not enough information, no fabricated estimate", () => {
    const r = compute(periods(["2025-01-01", "2025-01-29"]));
    expect(r.status).toBe("not_enough_information");
    expect(r.estimate).toBeNull();
    expect(r.window).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it("3 starts (2 intervals) → still not enough information", () => {
    const r = compute(periods(["2025-01-01", "2025-01-29", "2025-02-26"]));
    expect(r.status).toBe("not_enough_information");
    expect(r.estimate).toBeNull();
  });

  it("no periods → not enough information", () => {
    const r = compute([]);
    expect(r.status).toBe("not_enough_information");
    expect(r.estimate).toBeNull();
  });

  it("exactly 3 valid intervals → prediction appears", () => {
    const r = compute(periods(["2025-01-01", "2025-01-29", "2025-02-26", "2025-03-26"]));
    expect(r.status).toBe("ok");
    expect(r.estimate).toBe("2025-04-23");
    expect(r.confidence).toBe("high");
  });

  it("regular cycles → high confidence", () => {
    const r = compute(periods(["2025-01-01", "2025-01-29", "2025-02-26", "2025-03-26", "2025-04-23"]));
    expect(r.confidence).toBe("high");
    expect(r.flags).toEqual([]);
  });

  it("128-day gap excluded + missing_data flag", () => {
    const r = compute(periods(["2025-01-01", "2025-01-29", "2025-06-06", "2025-07-04", "2025-08-01"]));
    expect(r.status).toBe("ok");
    expect(r.flags).toContain("missing_data");
    expect(r.median_cycle_len).toBe(28);
  });

  it("sudden change flagged", () => {
    const r = compute(
      periods(["2025-01-01", "2025-01-29", "2025-02-26", "2025-03-26", "2025-04-23", "2025-06-07"])
    );
    expect(r.flags).toContain("change_detected");
  });

  it("ongoing period excluded from duration", () => {
    const r = compute(periods(SPEC_STARTS, 5, true));
    expect(r.expected_duration).toBe(5);
    expect(r.estimate).toBe("2025-10-29");
  });

  it("flag messages never diagnose", () => {
    const text = flagMessages(["high_variability", "change_detected", "missing_data"])
      .map((m) => m.message)
      .join(" ");
    expect(text).toContain("cannot determine");
    expect(text).not.toContain("%");
  });
});
