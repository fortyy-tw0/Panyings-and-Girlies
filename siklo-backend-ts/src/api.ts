/**
 * SikLo API facade — one function per endpoint in api-contract.md.
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
import * as chat from "./chat";

export interface ApiOptions {
  dataDir: string;
  paths?: { db?: string; libraryDb?: string; key?: string; model?: string };
}

export function createApi(db: Db, opts: ApiOptions) {
  initDb(db);
  const D = opts.dataDir;
  const ramChats = chat.newRamStore(); // retention='off' sessions live here only
  chat.sweepExpired(db);

  return {
    // records
    onboarding: (input: records.OnboardingInput) => (records.onboarding(db, D, input)),
    listPeriods: () => (records.listPeriods(db)),
    createPeriod: (input: records.PeriodInput) => (records.createPeriod(db, input)),
    updatePeriod: (id: number, input: records.PeriodInput) => (records.updatePeriod(db, id, input)),
    deletePeriod: (id: number) => (records.deletePeriod(db, id)),
    getLogs: (date: string) => (records.getLogs(db, D, date)),
    createLog: (input: records.LogInput) => (records.createLog(db, D, input)),
    listCategories: () => (records.listCategories(db)),
    updateCategories: (input: Parameters<typeof records.updateCategories>[1]) =>
      (records.updateCategories(db, input)),
    listNotes: (date?: string) => (records.listNotes(db, D, date)),
    createNote: (input: { date?: string | null; text: string }) => (records.createNote(db, D, input)),
    deleteNote: (id: number) => (records.deleteNote(db, id)),
    listActivity: () => (records.listActivity(db, D)),
    createActivity: (input: records.ActivityInput) => (records.createActivity(db, D, input)),
    deleteActivity: (id: number) => (records.deleteActivity(db, id)),
    getContraception: () => (records.getContraception(db, D)),
    putContraception: (input: { uses_pills: boolean; method?: string | null }) =>
      (records.putContraception(db, D, input)),

    // predictions & insights
    getNextPrediction: () => {
      const { explanation, ...rest } = prediction.compute(
        db.all<prediction.PeriodRow>("SELECT start_date, end_date FROM period WHERE kind='period'")
      );
      return rest;
    },
    getPredictionExplain: () => {
      const r = prediction.compute(db.all<prediction.PeriodRow>("SELECT start_date, end_date FROM period WHERE kind='period'"));
      return { ...(r.explanation ?? {}), status: r.status, estimate: r.estimate, window: r.window, confidence: r.confidence };
    },
    getInsights: () => {
      const periods = db.all<prediction.PeriodRow>("SELECT start_date, end_date FROM period WHERE kind='period'");
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
    getStatsForAi: () => prediction.getStatsForAi(db), // aggregate stats only; per-record data goes through getCompanionContext

    // chat sessions — retention 'off' is RAM-only; consent is per session,
    // per data type. The companion reads records only via getCompanionContext.
    startChatSession: (input: { mode?: string; retention?: chat.Retention } = {}) =>
      chat.startSession(db, ramChats, input),
    addChatMessage: (sessionId: string, input: { role: chat.ChatRole; text: string; sources?: unknown[] }) =>
      chat.addMessage(db, ramChats, D, sessionId, input),
    getChatMessages: (sessionId: string) => chat.getMessages(db, ramChats, D, sessionId),
    setChatConsent: (sessionId: string, consent: chat.Consent) =>
      chat.setConsent(db, ramChats, sessionId, consent),
    getChatConsent: (sessionId: string) => chat.getConsent(db, ramChats, sessionId),
    setChatRetention: (sessionId: string, retention: chat.Retention) =>
      chat.setRetention(db, ramChats, D, sessionId, retention),
    listChatSessions: () => chat.listSessions(db, ramChats),
    endChatSession: (sessionId: string) => chat.endSession(db, ramChats, sessionId),
    getCompanionContext: (sessionId: string) => chat.getCompanionContext(db, ramChats, D, sessionId),

    // reminders
    getPillReminder: () => (reminders.getPillReminder(db, D)),
    putPillReminder: (input: Parameters<typeof reminders.putPillReminder>[2]) =>
      (reminders.putPillReminder(db, D, input)),
    getDueReminders: (at?: Date) => (reminders.dueEvents(db, D, at)),
    respondToEvent: (id: number, status: "taken" | "skipped") => (reminders.respond(db, D, id, status)),
    getReminderHistory: (days?: number) => (reminders.reminderHistory(db, D, days)),
    listPregnancyTestReminders: () => (reminders.listPregnancyTestReminders(db, D)),
    createPregnancyTestReminder: (input: { date: string; note?: string | null }) =>
      (reminders.createPregnancyTestReminder(db, D, input)),
    deletePregnancyTestReminder: (id: number) => (reminders.deletePregnancyTestReminder(db, id)),

    // privacy & storage
    getStorage: () => (privacy.storageReport(opts.paths ?? {})),
    export: () => (privacy.exportData(db, D)),
    backup: (passphrase: string, destPath?: string) => {
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
      privacy.wipeUserData(db);
      ramChats.clear();
      if (opts2.deleteModel && opts.paths?.model) {
        try { fs.unlinkSync(opts.paths.model); } catch { /* ignore */ }
      }
    },
  };
}

export type SikloApi = ReturnType<typeof createApi>;
