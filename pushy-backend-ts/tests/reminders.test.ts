import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createApi, type PushyApi } from "../src/api";
import { openDb } from "../src/db.node";

let api: PushyApi;

beforeEach(() => {
  api = createApi(openDb(":memory:"), { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "pushy-")) });
});

function at(hour: number, dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe("reminders", () => {
  it("pill reminder due → respond taken → history", () => {
    api.putContraception({ uses_pills: true });
    api.putPillReminder({ enabled: true, time_local: "21:30", discreet_text: "Time for your reminder." });

    const due = api.getDueReminders(at(22));
    expect(due).toHaveLength(1);
    expect(due[0].type).toBe("pill");
    expect(due[0].text.toLowerCase()).not.toContain("birth control");

    api.respondToEvent(due[0].event_id as number, "taken");
    expect(api.getReminderHistory()[0].status).toBe("taken");
  });

  it("pending pill event becomes missed after grace", () => {
    api.putPillReminder({ enabled: true, time_local: "09:00" });
    api.getDueReminders(at(10)); // creates today's event
    // 3+ hours later, same day: swept to missed, no longer due
    const due = api.getDueReminders(at(23));
    expect(due.filter((e) => e.type === "pill")).toEqual([]);
    expect(api.getReminderHistory(7).some((h) => h.status === "missed")).toBe(true);
  });

  it("paused reminder produces no events", () => {
    api.putPillReminder({ enabled: true, time_local: "08:00", paused: true });
    expect(api.getDueReminders().filter((e) => e.type === "pill")).toEqual([]);
  });

  it("pregnancy-test reminder surfaces and completes", () => {
    api.createPregnancyTestReminder({ date: "2020-01-01", note: "check if late" });
    const due = api.getDueReminders().filter((e) => e.type === "pregnancy_test");
    expect(due).toHaveLength(1);
    api.respondToEvent(due[0].event_id as number, "taken");
    const reminders = api.listPregnancyTestReminders();
    expect(reminders[0].done).toBe(true);
    expect(reminders[0].note).toBe("check if late");
  });
});
