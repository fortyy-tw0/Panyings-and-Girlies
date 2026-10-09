/**
 * Records Service — port of pushy-backend/app/records. Same inputs/outputs
 * as the HTTP contract; errors come back as ApiError(status, code, msg).
 */

import type { Db } from "./db";
import { nowIso } from "./db";
import { apiError } from "./errors";
import * as crypto from "./crypto";

const FAR_FUTURE = "9999-12-31";
export const CONDITION_STATUSES = [
  "diagnosed_user_reported",
  "suspected_not_diagnosed",
  "prefer_not_to_say",
] as const;
export const CONTRACEPTION_OPTIONS = ["condom", "pills", "other", "none", "not_sure"] as const;

export type ConditionStatus = (typeof CONDITION_STATUSES)[number];
export type Contraception = (typeof CONTRACEPTION_OPTIONS)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(s: string, field: string) {
  if (!DATE_RE.test(s) || isNaN(Date.parse(s))) {
    apiError(400, "validation_error", `${field} must be YYYY-MM-DD`);
  }
}

// ---------- onboarding ----------

export interface OnboardingInput {
  language?: string;
  cycle_type?: string | null;
  health_context?: { kind?: string | null; condition_name?: string | null; status: ConditionStatus }[];
  enabled_categories?: string[];
}

export function onboarding(db: Db, dataDir: string, input: OnboardingInput) {
  const enabled = input.enabled_categories ?? [];
  db.run(
    "UPDATE profile SET language=?, cycle_type=?, enabled_categories_json=? WHERE id=1",
    input.language ?? "en", input.cycle_type ?? null, JSON.stringify(enabled)
  );
  db.run("DELETE FROM health_context");
  const key = crypto.appKey(dataDir);
  for (const hc of input.health_context ?? []) {
    // status enum enforced in code: a CHECK can't see inside the payload,
    // and nothing may ever promote suspected_not_diagnosed to diagnosed
    if (!CONDITION_STATUSES.includes(hc.status)) {
      apiError(400, "validation_error", "Invalid health context status.");
    }
    const { nonce, ct } = crypto.encryptText(
      key, JSON.stringify({ kind: hc.kind ?? null, condition_name: hc.condition_name ?? null, status: hc.status })
    );
    db.run("INSERT INTO health_context(payload_enc, nonce, created_at) VALUES (?,?,?)", ct, nonce, nowIso());
  }
  if (enabled.length) {
    db.run("UPDATE symptom_category SET enabled=0");
    for (const k of enabled) {
      db.run(
        "INSERT INTO symptom_category(key, label, is_custom, enabled) VALUES (?,?,0,1) ON CONFLICT(key) DO UPDATE SET enabled=1",
        k, k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      );
    }
  }
  const row = db.get("SELECT * FROM profile WHERE id=1")!;
  return {
    profile: {
      id: row.id,
      language: row.language,
      cycle_type: row.cycle_type,
      enabled_categories: JSON.parse((row.enabled_categories_json as string) || "[]"),
    },
  };
}

// ---------- periods ----------

export interface PeriodInput {
  start_date: string;
  end_date?: string | null;
  flow_level?: number | null;
}

export function listPeriods(db: Db) {
  return db
    .all("SELECT * FROM period ORDER BY start_date")
    .map((r) => ({ id: r.id, start_date: r.start_date, end_date: r.end_date, flow_level: r.flow_level }));
}

function checkOverlap(db: Db, start: string, end: string, excludeId?: number) {
  const sql =
    "SELECT id FROM period WHERE NOT (COALESCE(end_date, ?) < ? OR start_date > ?)" +
    (excludeId !== undefined ? " AND id != ?" : "");
  const params: unknown[] = excludeId !== undefined ? [FAR_FUTURE, start, end, excludeId] : [FAR_FUTURE, start, end];
  const clash = db.get(sql, ...params);
  if (clash) {
    apiError(409, "overlap", `This period overlaps an existing entry (id ${clash.id}).`);
  }
}

function validatePeriod(input: PeriodInput) {
  checkDate(input.start_date, "start_date");
  if (input.end_date != null) {
    checkDate(input.end_date, "end_date");
    if (input.end_date < input.start_date) {
      apiError(400, "validation_error", "end_date cannot be before start_date");
    }
  }
}

export function createPeriod(db: Db, input: PeriodInput) {
  validatePeriod(input);
  checkOverlap(db, input.start_date, input.end_date ?? FAR_FUTURE);
  db.run(
    "INSERT INTO period(start_date, end_date, flow_level, created_at, updated_at) VALUES (?,?,?,?,?)",
    input.start_date, input.end_date ?? null, input.flow_level ?? null, nowIso(), nowIso()
  );
  const row = db.get("SELECT * FROM period ORDER BY id DESC LIMIT 1")!;
  return { period: { id: row.id, start_date: row.start_date, end_date: row.end_date, flow_level: row.flow_level } };
}

export function updatePeriod(db: Db, id: number, input: PeriodInput) {
  if (!db.get("SELECT 1 FROM period WHERE id=?", id)) {
    apiError(404, "not_found", "Period not found.");
  }
  validatePeriod(input);
  checkOverlap(db, input.start_date, input.end_date ?? FAR_FUTURE, id);
  db.run(
    "UPDATE period SET start_date=?, end_date=?, flow_level=?, updated_at=? WHERE id=?",
    input.start_date, input.end_date ?? null, input.flow_level ?? null, nowIso(), id
  );
  const row = db.get("SELECT * FROM period WHERE id=?", id)!;
  return { period: { id: row.id, start_date: row.start_date, end_date: row.end_date, flow_level: row.flow_level } };
}

export function deletePeriod(db: Db, id: number): void {
  if (db.run("DELETE FROM period WHERE id=?", id) === 0) {
    apiError(404, "not_found", "Period not found.");
  }
}

// ---------- daily logs ----------

export interface LogInput {
  date: string;
  category: string;
  value?: string | null;
  note?: string | null;
}

export function getLogs(db: Db, dataDir: string, date: string) {
  checkDate(date, "date");
  const key = crypto.appKey(dataDir);
  const rows = db.all(
    "SELECT l.id, l.date, c.key AS category, l.value, l.note_enc, l.nonce" +
      " FROM daily_log l JOIN symptom_category c ON c.id = l.category_id" +
      " WHERE l.date = ? ORDER BY c.key",
    date
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    category: r.category,
    value: r.value,
    note: r.note_enc ? crypto.decryptText(key, r.nonce as Buffer, r.note_enc as Buffer) : null,
  }));
}

export function createLog(db: Db, dataDir: string, input: LogInput) {
  checkDate(input.date, "date");
  const cat = db.get("SELECT id, enabled FROM symptom_category WHERE key=?", input.category);
  if (!cat) apiError(404, "not_found", `Unknown symptom category '${input.category}'.`);
  if (!cat.enabled) apiError(400, "category_disabled", `Category '${input.category}' is disabled.`);
  const key = crypto.appKey(dataDir);
  const enc = input.note ? crypto.encryptText(key, input.note) : { nonce: null, ct: null };
  db.run(
    "INSERT INTO daily_log(date, category_id, value, note_enc, nonce) VALUES (?,?,?,?,?)" +
      " ON CONFLICT(date, category_id) DO UPDATE SET value=excluded.value," +
      " note_enc=excluded.note_enc, nonce=excluded.nonce",
    input.date, cat.id, input.value ?? null, enc.ct, enc.nonce
  );
  return getLogs(db, dataDir, input.date);
}

// ---------- categories ----------

export function listCategories(db: Db) {
  return db
    .all("SELECT key, label, is_custom, enabled FROM symptom_category ORDER BY id")
    .map((r) => ({ key: r.key, label: r.label, is_custom: !!r.is_custom, enabled: !!r.enabled }));
}

export function updateCategories(
  db: Db,
  input: { updates?: { key: string; enabled: boolean }[]; add?: { key: string; label: string }[] }
) {
  for (const u of input.updates ?? []) {
    db.run("UPDATE symptom_category SET enabled=? WHERE key=?", u.enabled, u.key);
  }
  for (const a of input.add ?? []) {
    db.run(
      "INSERT INTO symptom_category(key, label, is_custom, enabled) VALUES (?,?,1,1) ON CONFLICT(key) DO UPDATE SET label=excluded.label, enabled=1",
      a.key, a.label
    );
  }
  return listCategories(db);
}

// ---------- notes ----------

export function listNotes(db: Db, dataDir: string, date?: string) {
  const key = crypto.appKey(dataDir);
  const rows = date
    ? db.all("SELECT * FROM note WHERE date=? ORDER BY id", date)
    : db.all("SELECT * FROM note ORDER BY date, id");
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    text: crypto.decryptText(key, r.nonce as Buffer, r.text_enc as Buffer),
    created_at: r.created_at,
  }));
}

export function createNote(db: Db, dataDir: string, input: { date?: string | null; text: string }) {
  if (input.date) checkDate(input.date, "date");
  const { nonce, ct } = crypto.encryptText(crypto.appKey(dataDir), input.text);
  db.run("INSERT INTO note(date, text_enc, nonce, created_at) VALUES (?,?,?,?)", input.date ?? null, ct, nonce, nowIso());
  const id = db.get("SELECT last_insert_rowid() AS id")!.id;
  return { note: { id, date: input.date ?? null, text: input.text } };
}

export function deleteNote(db: Db, id: number): void {
  if (db.run("DELETE FROM note WHERE id=?", id) === 0) {
    apiError(404, "not_found", "Note not found.");
  }
}

// ---------- sexual activity (optional, encrypted) ----------

export interface ActivityInput {
  date: string;
  contraception?: Contraception | null;
  note?: string | null;
}

export function listActivity(db: Db, dataDir: string) {
  const key = crypto.appKey(dataDir);
  return db
    .all("SELECT * FROM sexual_activity ORDER BY created_at")
    .map((r) => ({
      id: r.id,
      ...(JSON.parse(crypto.decryptText(key, r.nonce as Buffer, r.payload_enc as Buffer)) as object),
    }))
    .sort((a: any, b: any) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
}

export function createActivity(db: Db, dataDir: string, input: ActivityInput) {
  checkDate(input.date, "date");
  if (input.contraception && !CONTRACEPTION_OPTIONS.includes(input.contraception)) {
    apiError(400, "validation_error", "Invalid contraception option.");
  }
  const payload = { date: input.date, contraception: input.contraception ?? null, note: input.note ?? null };
  const { nonce, ct } = crypto.encryptText(crypto.appKey(dataDir), JSON.stringify(payload));
  db.run("INSERT INTO sexual_activity(payload_enc, nonce, created_at) VALUES (?,?,?)", ct, nonce, nowIso());
  const id = db.get("SELECT last_insert_rowid() AS id")!.id;
  return { id, ...payload };
}

export function deleteActivity(db: Db, id: number): void {
  if (db.run("DELETE FROM sexual_activity WHERE id=?", id) === 0) {
    apiError(404, "not_found", "Entry not found.");
  }
}

// ---------- contraception preference ----------

export function getContraception(db: Db, dataDir: string) {
  const row = db.get("SELECT * FROM contraception_pref WHERE id=1");
  if (!row || !row.payload_enc) return { uses_pills: null, method: null };
  const payload = JSON.parse(
    crypto.decryptText(crypto.appKey(dataDir), row.nonce as Buffer, row.payload_enc as Buffer)
  );
  return { uses_pills: payload.uses_pills ?? null, method: payload.method ?? null };
}

export function putContraception(
  db: Db,
  dataDir: string,
  input: { uses_pills: boolean; method?: string | null }
) {
  const { nonce, ct } = crypto.encryptText(
    crypto.appKey(dataDir),
    JSON.stringify({ uses_pills: input.uses_pills, method: input.method ?? null })
  );
  db.run(
    "INSERT INTO contraception_pref(id, payload_enc, nonce, updated_at) VALUES (1,?,?,?)" +
      " ON CONFLICT(id) DO UPDATE SET payload_enc=excluded.payload_enc," +
      " nonce=excluded.nonce, updated_at=excluded.updated_at",
    ct, nonce, nowIso()
  );
  return getContraception(db, dataDir);
}
