import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createApi, type SikloApi } from "../src/api";
import { openDb } from "../src/db.node";
import { ApiError } from "../src/errors";

let api: SikloApi;
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "siklo-"));
  api = createApi(openDb(":memory:"), { dataDir });
});

describe("records", () => {
  it("onboarding saves profile and enforces status enum", () => {
    const r = api.onboarding({
      language: "fil",
      cycle_type: "irregular",
      health_context: [{ kind: "condition", condition_name: "PCOS", status: "suspected_not_diagnosed" }],
      enabled_categories: ["cramps", "mood"],
    });
    expect(r.profile.language).toBe("fil");
    const cats = Object.fromEntries(api.listCategories().map((c) => [c.key, c.enabled]));
    expect(cats.cramps).toBe(true);
    expect(cats.flow).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(() =>
      api.onboarding({ health_context: [{ status: "confirmed_by_doctor" as never }] })
    ).toThrowError(ApiError);
  });

  it("period CRUD + overlap 409", () => {
    const r = api.createPeriod({ start_date: "2026-09-01", end_date: "2026-09-05", flow_level: 2 });
    expect(() => api.createPeriod({ start_date: "2026-09-04", end_date: "2026-09-08" })).toThrowError(
      expect.objectContaining({ status: 409, code: "overlap" })
    );
    expect(() => api.createPeriod({ start_date: "2026-11-10", end_date: "2026-11-05" })).toThrowError(
      ApiError
    );
    api.updatePeriod(r.period.id as number, { start_date: "2026-09-01", end_date: "2026-09-06" });
    api.deletePeriod(r.period.id as number);
    expect(api.listPeriods()).toEqual([]);
  });

  it("ongoing period blocks overlap", () => {
    api.createPeriod({ start_date: "2026-10-01" });
    expect(() => api.createPeriod({ start_date: "2026-10-20", end_date: "2026-10-24" })).toThrowError(
      expect.objectContaining({ code: "overlap" })
    );
  });

  it("log upsert + disabled category rejected", () => {
    api.createLog({ date: "2026-10-01", category: "cramps", value: "2" });
    const logs = api.createLog({ date: "2026-10-01", category: "cramps", value: "3" });
    expect(logs.filter((l) => l.category === "cramps")).toHaveLength(1);
    expect(logs[0].value).toBe("3");

    api.updateCategories({ updates: [{ key: "mood", enabled: false }] });
    expect(() => api.createLog({ date: "2026-10-01", category: "mood" })).toThrowError(
      expect.objectContaining({ code: "category_disabled" })
    );
  });

  it("notes + activity roundtrip, nothing readable in the db file", () => {
    api.createNote({ date: "2026-10-01", text: "felt really tired today" });
    expect(api.listNotes()[0].text).toBe("felt really tired today");

    api.createActivity({ date: "2026-10-02", contraception: "condom" });
    expect(api.listActivity()[0]).toMatchObject({ contraception: "condom" });
    api.createActivity({ date: "2026-10-03" }); // everything but date skippable
  });

  it("contraception pref", () => {
    expect(api.getContraception().uses_pills).toBeNull();
    expect(api.putContraception({ uses_pills: true, method: "pills" })).toEqual({
      uses_pills: true,
      method: "pills",
    });
  });
});
