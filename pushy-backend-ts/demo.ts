/**
 * Interactive demo — run with:  npx vite-node demo.ts
 * Edit the calls below and re-run to try things. Uses a real SQLite file
 * (demo.db in this folder) so data persists between runs. Delete that
 * file to start fresh.
 */

import { createApi } from "./src/api";
import { openDb } from "./src/db.node";

const api = createApi(openDb("demo.db"), { dataDir: "." });

// --- seed: the same irregular demo user (only runs once) ---
if (api.listPeriods().length === 0) {
  const starts = ["2025-04-24", "2025-05-21", "2025-06-21", "2025-07-27", "2025-08-25", "2025-09-28"];
  for (const s of starts) {
    api.createPeriod({ start_date: s, end_date: addDays(s, 4), flow_level: 2 });
  }
  api.createLog({ date: "2025-09-28", category: "cramps", value: "3" });
  api.createLog({ date: "2025-09-29", category: "cramps", value: "2" });
  api.createNote({ date: "2025-09-28", text: "rough first day" });
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const show = (label: string, v: unknown) =>
  console.log(`\n=== ${label} ===\n` + JSON.stringify(v, null, 2));

// --- try things here ---
show("periods", api.listPeriods());
show("next prediction", api.getNextPrediction());
show("insights", api.getInsights());
show("stats for AI", api.getStatsForAi());
show("logs 2025-09-28", api.getLogs("2025-09-28"));
show("notes", api.listNotes());
show("pill reminder", api.getPillReminder());
show("due reminders", api.getDueReminders());
