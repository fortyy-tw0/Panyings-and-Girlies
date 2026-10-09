import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createApi, type PushyApi } from "../src/api";
import { openDb } from "../src/db.node";
import { ApiError } from "../src/errors";

let api: PushyApi;
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pushy-"));
  api = createApi(openDb(":memory:"), { dataDir });
});

describe("privacy", () => {
  it("export contains decrypted data", () => {
    api.createPeriod({ start_date: "2026-09-01", end_date: "2026-09-05" });
    api.createNote({ date: "2026-09-02", text: "private entry" });
    api.createActivity({ date: "2026-09-03", contraception: "condom" });
    const data = api.export() as never as Record<string, never[]>;
    expect(data.periods[0]).toMatchObject({ start_date: "2026-09-01" });
    expect(data.notes[0]).toMatchObject({ text: "private entry" });
    expect(data.sexual_activity[0]).toMatchObject({ contraception: "condom" });
  });

  it("backup → wipe → restore roundtrip", () => {
    api.createPeriod({ start_date: "2026-09-01", end_date: "2026-09-05" });
    api.createNote({ date: "2026-09-02", text: "secret note" });

    const { path: backupPath } = api.backup("hunter2", path.join(dataDir, "b.pushybackup"));
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath)).not.toContain("secret note");

    api.deleteAll();
    expect(api.listPeriods()).toEqual([]);

    expect(api.restore("hunter2", backupPath)).toEqual({ restored: true });
    expect(api.listPeriods()[0].start_date).toBe("2026-09-01");
    expect(api.listNotes()[0].text).toBe("secret note");
  });

  it("wrong passphrase rejected cleanly", () => {
    const { path: backupPath } = api.backup("right", path.join(dataDir, "b.pushybackup"));
    expect(() => api.restore("wrong", backupPath)).toThrowError(
      expect.objectContaining({ status: 400 })
    );
  });

  it("deleteAll wipes and re-seeds defaults", () => {
    api.createPeriod({ start_date: "2026-09-01", end_date: "2026-09-05" });
    api.deleteAll();
    expect(api.listPeriods()).toEqual([]);
    expect(api.listCategories().some((c) => c.key === "cramps")).toBe(true);
  });

  it("lock gates the api until unlocked", () => {
    api.lock("pin");
    expect(() => api.listPeriods()).toThrowError(
      expect.objectContaining({ status: 423, code: "locked" })
    );
    expect(() => api.unlock("nope")).toThrowError(ApiError);
    expect(api.unlock("pin")).toEqual({ unlocked: true });
    expect(api.listPeriods()).toEqual([]);
  });
});
