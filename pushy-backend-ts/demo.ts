/**
 * Interactive demo — run with:  npx vite-node demo.ts
 * A keyboard menu that calls the real pushy-backend-ts api. Data persists
 * in demo.db in this folder; delete that file to start fresh.
 */

import * as readline from "node:readline/promises";
import { createApi } from "./src/api";
import { openDb } from "./src/db.node";

const api = createApi(openDb("demo.db"), { dataDir: "." });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const show = (v: unknown) => console.log(JSON.stringify(v, null, 2));

// seed the irregular demo user once
if (api.listPeriods().length === 0) {
  for (const s of ["2025-04-24", "2025-05-21", "2025-06-21", "2025-07-27", "2025-08-25", "2025-09-28"]) {
    api.createPeriod({ start_date: s, end_date: addDays(s, 4), flow_level: 2 });
  }
  api.createLog({ date: "2025-09-28", category: "cramps", value: "3" });
  console.log("(seeded demo data — delete demo.db to reset)");
}

const menu = `
What do you want to do?
  1)  List my periods
  2)  Log a period
  3)  Log a symptom/mood for a day
  4)  Add a private note
  5)  Next period prediction
  6)  Insights & patterns
  7)  Turn on a pill reminder
  8)  Check what's due
  9)  Mark a reminder taken/skipped
  10) Export all my data
  11) Make an encrypted backup
  0)  Quit
`;

async function ask(q: string) {
  return (await rl.question(q)).trim();
}

async function main() {
  for (;;) {
    const choice = await ask(menu + "> ");
    try {
      if (choice === "1") {
        show(api.listPeriods());
      } else if (choice === "2") {
        const start = await ask("Start date (YYYY-MM-DD): ");
        const end = (await ask("End date (blank if still on it): ")) || null;
        const flow = Number(await ask("Flow 1-3 (blank to skip): ")) || undefined;
        const r = api.createPeriod({ start_date: start, end_date: end, flow_level: flow });
        console.log("Saved:", r.period.id);
      } else if (choice === "3") {
        const date = (await ask(`Date (blank = today ${today()}): `)) || today();
        const cat = await ask("Category (cramps, mood, energy, sleep, headache, bloating…): ");
        const value = await ask("Value (e.g. 1-3, or a word): ");
        show(api.createLog({ date, category: cat, value }));
      } else if (choice === "4") {
        const text = await ask("Note text: ");
        api.createNote({ date: today(), text });
        console.log("Saved (encrypted).");
      } else if (choice === "5") {
        show(api.getNextPrediction());
      } else if (choice === "6") {
        show(api.getInsights());
      } else if (choice === "7") {
        const time = await ask("Time (HH:MM): ");
        api.putPillReminder({ enabled: true, time_local: time });
        console.log("Pill reminder set for", time);
      } else if (choice === "8") {
        show(api.getDueReminders());
      } else if (choice === "9") {
        const id = Number(await ask("Event id (from option 8): "));
        const status = (await ask("taken or skipped? ")) as "taken" | "skipped";
        show(api.respondToEvent(id, status));
      } else if (choice === "10") {
        show(api.export());
      } else if (choice === "11") {
        const pass = await ask("Backup passphrase: ");
        const p = await ask("Save as (blank = backup.pushybackup): ");
        show(api.backup(pass, p || "backup.pushybackup"));
      } else if (choice === "0") {
        break;
      }
    } catch (e) {
      if (e && typeof e === "object" && "code" in e) {
        console.log(`\n[${(e as { status: number }).status}] ${(e as { code: string }).code}: ${(e as Error).message}`);
      } else {
        console.log("Error:", e);
      }
    }
  }
  rl.close();
}

main();
