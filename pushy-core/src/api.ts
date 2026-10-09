/**
 * Pu-shy API facade — one function per endpoint in api-contract.md.
 * This is what the FastAPI layer exposed over HTTP; on the phone the app
 * calls these directly. Locked state is process-memory only, like the
 * Python middleware.
 */

import * as fs from "node:fs";

import type { Db } from "./db";
import { initDb } from "./db";
import { ApiError, apiError } from "./errors";
import * as records from "./records";
import * as prediction from "./prediction";
import * as reminders from "./reminders";
import * as privacy from "./privacy";

export interface ApiOptions {
  dataDir: string;
  paths?: { db?: string; libraryDb?: string; key?: string; model?: string };
}

export function createApi(db: Db, opts: ApiOptions) {
  initDb(db);
  let locked = false;
  const lockRow = db.get("SELECT app_lock_hash FROM profile WHERE id=1");
  if (lockRow?.app_lock_hash) locked = true;

  const gate = () => {
    if (locked) apiError(423, "locked", "App is locked.");
  };
  const D = opts.dataDir;

  return {
    // records
    onboarding: (input: records.OnboardingInput) => (gate(), records.onboarding(db, D, input)),
    listPeriods: () => (gate(), records.listPeriods(db)),
    createPeriod: (input: records.PeriodInput) => (gate(), records.createPeriod(db, input)),
    updatePeriod: (id: number, input: records.PeriodInput) => (gate(), records.updatePeriod(db, id, input)),
    deletePeriod: (id: number) => (gate(), records.deletePeriod(db, id)),
    getLogs: (date: string) => (gate(), records.getLogs(db, D, date)),
    createLog: (input: records.LogInput) => (gate(), records.createLog(db, D, input)),
    listCategories: () => (gate(), records.listCategories(db)),
    updateCategories: (input: Parameters<typeof records.updateCategories>[1]) =>
      (gate(), records.updateCategories(db, input)),
    listNotes: (date?: string) => (gate(), records.listNotes(db, D, date)),
    createNote: (input: { date?: string | null; text: string }) => (gate(), records.createNote(db, D, input)),
    deleteNote: (id: number) => (gate(), records.deleteNote(db, id)),
    listActivity: () => (gate(), records.listActivity(db, D)),
    createActivity: (input: records.ActivityInput) => (gate(), records.createActivity(db, D, input)),
    deleteActivity: (id: number) => (gate(), records.deleteActivity(db, id)),
    getContraception: () => (gate(), records.getContraception(db, D)),
    putContraception: (input: { uses_pills: boolean; method?: string | null }) =>
      (gate(), records.putContraception(db, D, input)),

    // predictions & insights
    getNextPrediction: () => {
      gate();
      const { explanation, ...rest } = prediction.compute(
        db.all<prediction.PeriodRow>("SELECT start_date, end_date FROM period")
      );
      return rest;
    },
    getPredictionExplain: () => {
      gate();
      const r = prediction.compute(db.all<prediction.PeriodRow>("SELECT start_date, end_date FROM period"));
      return { ...(r.explanation ?? {}), status: r.status, estimate: r.estimate, window: r.window, confidence: r.confidence };
    },
    getInsights: () => {
      gate();
      const periods = db.all<prediction.PeriodRow>("SELECT start_date, end_date FROM period");
      const r = prediction.compute(periods);
      return {
        status: r.status,
        cycles_used: r.cycles_used,
        median_cycle_len: r.median_cycle_len,
        cycle_range: r.cycle_range,
        confidence: r.confidence,
        expected_duration: r.expected_duration,
        pattern_flags: prediction.flagMessages(r.flags),
        symptom_patterns: prediction.symptomPatterns(db, periods),
      };
    },
    getStatsForAi: () => prediction.getStatsForAi(db), // B2 calls this directly; not lock-gated

    // reminders
    getPillReminder: () => (gate(), reminders.getPillReminder(db, D)),
    putPillReminder: (input: Parameters<typeof reminders.putPillReminder>[2]) =>
      (gate(), reminders.putPillReminder(db, D, input)),
    getDueReminders: (at?: Date) => (gate(), reminders.dueEvents(db, D, at)),
    respondToEvent: (id: number, status: "taken" | "skipped") => (gate(), reminders.respond(db, D, id, status)),
    getReminderHistory: (days?: number) => (gate(), reminders.reminderHistory(db, D, days)),
    listPregnancyTestReminders: () => (gate(), reminders.listPregnancyTestReminders(db, D)),
    createPregnancyTestReminder: (input: { date: string; note?: string | null }) =>
      (gate(), reminders.createPregnancyTestReminder(db, D, input)),
    deletePregnancyTestReminder: (id: number) => (gate(), reminders.deletePregnancyTestReminder(db, id)),

    // privacy & storage
    getStorage: () => (gate(), privacy.storageReport(opts.paths ?? {})),
    export: () => (gate(), privacy.exportData(db, D)),
    backup: (passphrase: string, destPath?: string) => {
      gate();
      if (!passphrase) apiError(400, "validation_error", "A passphrase is required to encrypt the backup.");
      try {
        const path = privacy.makeBackup(db, D, passphrase, destPath);
        return { path, bytes: fs.statSync(path).size };
      } catch (e) {
        if (e instanceof ApiError) throw e;
        apiError(400, "invalid_path", `Cannot write backup there: ${e}`);
      }
    },
    restore: (passphrase: string, backupPath: string) => {
      gate();
      let data;
      try {
        data = privacy.readBackup(backupPath, passphrase);
      } catch {
        apiError(400, "invalid_backup", "Wrong passphrase or corrupted backup.");
      }
      privacy.importData(db, D, data);
      return { restored: true };
    },
    deleteAll: (opts2: { deleteModel?: boolean } = {}) => {
      gate();
      privacy.wipeUserData(db);
      if (opts2.deleteModel && opts.paths?.model) {
        try { fs.unlinkSync(opts.paths.model); } catch { /* ignore */ }
      }
    },
    lock: (passphrase: string) => {
      const r = privacy.lock(db, passphrase);
      locked = true;
      return r;
    },
    unlock: (passphrase: string) => {
      const r = privacy.unlock(db, passphrase);
      locked = false;
      return r;
    },
  };
}

export type PushyApi = ReturnType<typeof createApi>;
