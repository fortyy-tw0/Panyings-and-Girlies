/**
 * Reminder Service — port of pushy-backend/app/reminders. Stores
 * user-entered schedules + completion history; never suggests a schedule.
 * On the phone the OS notification is scheduled by the app layer — this
 * service only reports what is due.
 */

import type { Db } from "./db";
import { localIso, nowIso } from "./db";
import { apiError } from "./errors";
import * as crypto from "./crypto";

export const GRACE_MS = 2 * 60 * 60 * 1000;
export const PILL = "pill";
export const PREGNANCY_TEST = "pregnancy_test";
export const DEFAULT_PILL_TEXT = "Time for your reminder.";
export const DEFAULT_PT_TEXT = "Pregnancy test reminder.";

const enc = (key: Buffer, text: string) => crypto.encryptText(key, text);
const dec = (key: Buffer, nonce: unknown, blob: unknown) =>
  blob ? crypto.decryptText(key, nonce as Buffer, blob as Buffer) : null;

function eventType(key: Buffer, row: Record<string, unknown>): string {
  return dec(key, row.nonce, row.reminder_type_enc)!;
}

export interface PillReminder {
  enabled: boolean;
  paused: boolean;
  time_local: string | null;
  discreet_text: string | null;
}

export function getPillReminder(db: Db, dataDir: string): PillReminder | null {
  const r = db.get("SELECT * FROM pill_reminder WHERE id=1");
  if (!r) return null;
  const payload = r.payload_enc
    ? JSON.parse(dec(crypto.appKey(dataDir), r.nonce, r.payload_enc)!)
    : {};
  return {
    enabled: !!r.enabled,
    paused: !!r.paused,
    time_local: payload.time_local ?? null,
    discreet_text: payload.discreet_text ?? null,
  };
}

export function putPillReminder(
  db: Db,
  dataDir: string,
  input: { enabled: boolean; time_local: string; discreet_text?: string | null; paused?: boolean }
): PillReminder {
  if (!/^\d{2}:\d{2}$/.test(input.time_local)) {
    apiError(400, "validation_error", "time_local must be 'HH:MM'");
  }
  const [h, m] = input.time_local.split(":").map(Number);
  if (h > 23 || m > 59) apiError(400, "validation_error", "time_local must be 'HH:MM'");
  const { nonce, ct } = enc(
    crypto.appKey(dataDir),
    JSON.stringify({ time_local: input.time_local, discreet_text: input.discreet_text ?? null })
  );
  const now = nowIso();
  db.run(
    "INSERT INTO pill_reminder(id, enabled, paused, payload_enc, nonce, created_at, updated_at)" +
      " VALUES (1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled," +
      " paused=excluded.paused, payload_enc=excluded.payload_enc, nonce=excluded.nonce," +
      " updated_at=excluded.updated_at",
    input.enabled, input.paused ?? false, ct, nonce, now, now
  );
  clearPendingPillEvents(db, dataDir); // regenerate at the new time
  return getPillReminder(db, dataDir)!;
}

function pendingEvents(db: Db, where = "", params: unknown[] = []) {
  return db.all("SELECT * FROM reminder_event WHERE status='pending' " + where, ...params);
}

export function ensurePillEvent(db: Db, dataDir: string, now: Date): void {
  const r = getPillReminder(db, dataDir);
  if (!r || !r.enabled || r.paused || !r.time_local) return;
  const [h, m] = r.time_local.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const key = crypto.appKey(dataDir);
  const exists = pendingEvents(db, "AND scheduled_for >= ?", [localIso(dayStart)]).some(
    (row) => eventType(key, row) === PILL
  );
  if (!exists) {
    insertEvent(db, dataDir, PILL, null, localIso(scheduled));
  }
}

export function sweepMissed(db: Db, dataDir: string, now: Date): void {
  // Only pill events auto-miss; pregnancy-test reminders stay pending.
  const cutoff = localIso(new Date(now.getTime() - GRACE_MS));
  const key = crypto.appKey(dataDir);
  for (const row of pendingEvents(db, "AND scheduled_for < ?", [cutoff])) {
    if (eventType(key, row) === PILL) {
      db.run("UPDATE reminder_event SET status='missed' WHERE id=?", row.id);
    }
  }
}

export function dueEvents(db: Db, dataDir: string, now = new Date()) {
  ensurePillEvent(db, dataDir, now);
  sweepMissed(db, dataDir, now);
  const key = crypto.appKey(dataDir);
  const reminder = getPillReminder(db, dataDir);
  return pendingEvents(db, "AND scheduled_for <= ? ORDER BY scheduled_for", [localIso(now)]).map(
    (row) => {
      const type = eventType(key, row);
      return {
        event_id: row.id,
        type,
        text: type === PILL ? reminder?.discreet_text ?? DEFAULT_PILL_TEXT : DEFAULT_PT_TEXT,
        scheduled_for: row.scheduled_for,
      };
    }
  );
}

export function respond(db: Db, dataDir: string, eventId: number, status: "taken" | "skipped") {
  const row = db.get("SELECT * FROM reminder_event WHERE id=?", eventId);
  if (!row) apiError(404, "not_found", "Reminder event not found.");
  db.run("UPDATE reminder_event SET status=?, responded_at=? WHERE id=?", status, nowIso(), eventId);
  if (eventType(crypto.appKey(dataDir), row) === PREGNANCY_TEST && row.ref_id) {
    db.run("UPDATE pregnancy_test_reminder SET done=1 WHERE id=?", row.ref_id);
  }
  return { event_id: eventId, status };
}

export function clearPendingPillEvents(db: Db, dataDir: string): void {
  const key = crypto.appKey(dataDir);
  for (const row of pendingEvents(db)) {
    if (eventType(key, row) === PILL) {
      db.run("DELETE FROM reminder_event WHERE id=?", row.id);
    }
  }
}

export function insertEvent(
  db: Db,
  dataDir: string,
  reminderType: string,
  refId: number | null,
  scheduledFor: string
): void {
  const { nonce, ct } = enc(crypto.appKey(dataDir), reminderType);
  db.run(
    "INSERT INTO reminder_event(reminder_type_enc, nonce, ref_id, scheduled_for, status, created_at)" +
      " VALUES (?,?,?,?, 'pending', ?)",
    ct, nonce, refId, scheduledFor, nowIso()
  );
}

export function reminderHistory(db: Db, dataDir: string, days = 30) {
  const since = localIso(new Date(Date.now() - days * 86_400_000));
  const key = crypto.appKey(dataDir);
  return db
    .all("SELECT * FROM reminder_event WHERE scheduled_for >= ? ORDER BY scheduled_for DESC", since)
    .map((r) => ({
      id: r.id,
      type: eventType(key, r),
      scheduled_for: r.scheduled_for,
      status: r.status,
      responded_at: r.responded_at,
    }));
}

// ---------- pregnancy-test reminders ----------

export function listPregnancyTestReminders(db: Db, dataDir: string) {
  const key = crypto.appKey(dataDir);
  return db.all("SELECT * FROM pregnancy_test_reminder ORDER BY date").map((r) => ({
    id: r.id,
    date: r.date,
    note: dec(key, r.nonce, r.note_enc),
    done: !!r.done,
  }));
}

export function createPregnancyTestReminder(
  db: Db,
  dataDir: string,
  input: { date: string; note?: string | null }
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    apiError(400, "validation_error", "date must be YYYY-MM-DD");
  }
  const key = crypto.appKey(dataDir);
  const encNote = input.note ? enc(key, input.note) : { nonce: null, ct: null };
  db.run(
    "INSERT INTO pregnancy_test_reminder(date, note_enc, nonce, created_at) VALUES (?,?,?,?)",
    input.date, encNote.ct, encNote.nonce, nowIso()
  );
  const id = Number(db.get("SELECT last_insert_rowid() AS id")!.id);
  insertEvent(db, dataDir, PREGNANCY_TEST, id, `${input.date}T09:00:00`);
  const r = db.get("SELECT * FROM pregnancy_test_reminder WHERE id=?", id)!;
  return {
    reminder: { id: r.id, date: r.date, note: dec(key, r.nonce, r.note_enc), done: !!r.done },
  };
}

export function deletePregnancyTestReminder(db: Db, id: number): void {
  const changes = db.run("DELETE FROM pregnancy_test_reminder WHERE id=?", id);
  // ref_id only marks pregnancy-test events, so no type check needed
  db.run("DELETE FROM reminder_event WHERE ref_id=? AND status='pending'", id);
  if (changes === 0) apiError(404, "not_found", "Reminder not found.");
}
