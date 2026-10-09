/**
 * Privacy & Storage — export, encrypted backup/restore, wipe, app lock.
 * Backup format identical to the Python backend: JSON header line + AES-GCM
 * ciphertext, so backups are interchangeable across implementations.
 *
 * File access uses node:fs; on React Native swap fs reads/writes for
 * expo-file-system (same function signatures).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { Db } from "./db";
import { DEFAULT_CATEGORIES, nowIso } from "./db";
import { apiError } from "./errors";
import * as crypto from "./crypto";

const MAGIC = "PUSHYBACKUP";
const FORMAT_VERSION = 1;

// ---------- export / import ----------

export function exportData(db: Db, dataDir: string) {
  const key = crypto.appKey(dataDir);
  const dec = (nonce: unknown, blob: unknown) =>
    blob ? crypto.decryptText(key, nonce as Buffer, blob as Buffer) : null;
  const all = (t: string) => db.all(`SELECT * FROM ${t}`);

  const logs = db.all(
    "SELECT l.date, c.key AS category, l.value, l.note_enc, l.nonce" +
      " FROM daily_log l JOIN symptom_category c ON c.id = l.category_id"
  );

  const profile = { ...db.get("SELECT * FROM profile WHERE id=1")! } as Record<string, unknown>;
  delete profile.app_lock_hash;
  profile.enabled_categories = JSON.parse(String(profile.enabled_categories_json ?? "[]"));
  delete profile.enabled_categories_json;

  const pill = db.get("SELECT * FROM pill_reminder WHERE id=1");
  let pillJson = null;
  if (pill && pill.payload_enc) {
    const payload = JSON.parse(dec(pill.nonce, pill.payload_enc)!);
    pillJson = {
      enabled: !!pill.enabled,
      paused: !!pill.paused,
      time_local: payload.time_local ?? null,
      discreet_text: payload.discreet_text ?? null,
    };
  }

  const cp = db.get("SELECT * FROM contraception_pref WHERE id=1");
  const cpJson = cp && cp.payload_enc ? JSON.parse(dec(cp.nonce, cp.payload_enc)!) : {};

  const events = all("reminder_event").map((e) => {
    const out = { ...e } as Record<string, unknown>;
    out.reminder_type = dec(out.nonce, out.reminder_type_enc);
    delete out.nonce;
    delete out.reminder_type_enc;
    return out;
  });

  return {
    version: FORMAT_VERSION,
    exported_at: nowIso(),
    profile,
    health_context: all("health_context").map((r) => JSON.parse(dec(r.nonce, r.payload_enc)!)),
    periods: all("period"),
    symptom_categories: all("symptom_category"),
    daily_logs: logs.map((r) => ({
      date: r.date,
      category: r.category,
      value: r.value,
      note: dec(r.nonce, r.note_enc),
    })),
    notes: all("note").map((r) => ({
      date: r.date,
      text: dec(r.nonce, r.text_enc),
      created_at: r.created_at,
    })),
    sexual_activity: all("sexual_activity").map((r) => JSON.parse(dec(r.nonce, r.payload_enc)!)),
    contraception_pref: cpJson,
    pill_reminder: pillJson,
    reminder_events: events,
    pregnancy_test_reminders: all("pregnancy_test_reminder").map((r) => ({
      date: r.date,
      note: dec(r.nonce, r.note_enc),
      done: !!r.done,
    })),
  };
}

export function wipeUserData(db: Db): void {
  for (const t of [
    "daily_log", "note", "sexual_activity", "period", "health_context",
    "reminder_event", "pregnancy_test_reminder", "symptom_category",
    "pill_reminder", "contraception_pref", "profile",
  ]) {
    db.run(`DELETE FROM ${t}`);
  }
  db.run("INSERT OR IGNORE INTO profile(id, created_at) VALUES (1, ?)", nowIso());
  db.run("INSERT OR IGNORE INTO contraception_pref(id) VALUES (1)");
  for (const [key, label] of DEFAULT_CATEGORIES) {
    db.run("INSERT OR IGNORE INTO symptom_category(key, label, is_custom, enabled) VALUES (?,?,0,1)", key, label);
  }
}

export function importData(db: Db, dataDir: string, data: Record<string, unknown>): void {
  if (!data || !Array.isArray(data.periods)) {
    apiError(400, "invalid_backup", "not a Pu-shy export");
  }
  const key = crypto.appKey(dataDir);
  wipeUserData(db);

  const p = (data.profile ?? {}) as Record<string, unknown>;
  db.run(
    "UPDATE profile SET language=?, cycle_type=?, enabled_categories_json=? WHERE id=1",
    p.language ?? "en", p.cycle_type ?? null, JSON.stringify(p.enabled_categories ?? [])
  );
  for (const hc of (data.health_context ?? []) as Record<string, unknown>[]) {
    let status = String(hc.status ?? "prefer_not_to_say");
    if (!["diagnosed_user_reported", "suspected_not_diagnosed", "prefer_not_to_say"].includes(status)) {
      status = "prefer_not_to_say";
    }
    const { nonce, ct } = crypto.encryptText(key, JSON.stringify({
      kind: hc.kind ?? null, condition_name: hc.condition_name ?? null, status,
    }));
    db.run("INSERT INTO health_context(payload_enc, nonce, created_at) VALUES (?,?,?)", ct, nonce, hc.created_at ?? nowIso());
  }
  for (const r of (data.periods ?? []) as Record<string, unknown>[]) {
    db.run(
      "INSERT INTO period(start_date, end_date, flow_level, created_at, updated_at) VALUES (?,?,?,?,?)",
      r.start_date, r.end_date ?? null, r.flow_level ?? null, r.created_at ?? nowIso(), r.updated_at ?? nowIso()
    );
  }
  for (const c of (data.symptom_categories ?? []) as Record<string, unknown>[]) {
    db.run(
      "INSERT INTO symptom_category(key, label, is_custom, enabled) VALUES (?,?,?,?)" +
        " ON CONFLICT(key) DO UPDATE SET label=excluded.label, is_custom=excluded.is_custom, enabled=excluded.enabled",
      c.key, c.label, c.is_custom ?? 0, c.enabled ?? 1
    );
  }
  const catIds = new Map(
    db.all<{ id: number; key: string }>("SELECT id, key FROM symptom_category").map((r) => [r.key, r.id])
  );
  for (const l of (data.daily_logs ?? []) as Record<string, unknown>[]) {
    const cid = catIds.get(String(l.category));
    if (!cid) continue;
    const enc = l.note ? crypto.encryptText(key, String(l.note)) : { nonce: null, ct: null };
    db.run(
      "INSERT OR REPLACE INTO daily_log(date, category_id, value, note_enc, nonce) VALUES (?,?,?,?,?)",
      l.date, cid, l.value ?? null, enc.ct, enc.nonce
    );
  }
  for (const n of (data.notes ?? []) as Record<string, unknown>[]) {
    const { nonce, ct } = crypto.encryptText(key, String(n.text));
    db.run("INSERT INTO note(date, text_enc, nonce, created_at) VALUES (?,?,?,?)", n.date ?? null, ct, nonce, n.created_at ?? nowIso());
  }
  for (const a of (data.sexual_activity ?? []) as Record<string, unknown>[]) {
    const { nonce, ct } = crypto.encryptText(key, JSON.stringify(a));
    db.run("INSERT INTO sexual_activity(payload_enc, nonce, created_at) VALUES (?,?,?)", ct, nonce, nowIso());
  }
  const cp = (data.contraception_pref ?? {}) as Record<string, unknown>;
  if (Object.keys(cp).length) {
    const { nonce, ct } = crypto.encryptText(key, JSON.stringify({
      uses_pills: cp.uses_pills ?? null, method: cp.method ?? null,
    }));
    db.run("UPDATE contraception_pref SET payload_enc=?, nonce=?, updated_at=? WHERE id=1", ct, nonce, nowIso());
  }
  const pill = data.pill_reminder as Record<string, unknown> | null;
  if (pill) {
    const { nonce, ct } = crypto.encryptText(key, JSON.stringify({
      time_local: pill.time_local ?? null, discreet_text: pill.discreet_text ?? null,
    }));
    db.run(
      "INSERT OR REPLACE INTO pill_reminder(id, enabled, paused, payload_enc, nonce, created_at, updated_at)" +
        " VALUES (1,?,?,?,?,?,?)",
      pill.enabled ?? 0, pill.paused ?? 0, ct, nonce, nowIso(), nowIso()
    );
  }
  for (const e of (data.reminder_events ?? []) as Record<string, unknown>[]) {
    const { nonce, ct } = crypto.encryptText(key, String(e.reminder_type));
    db.run(
      "INSERT INTO reminder_event(reminder_type_enc, nonce, ref_id, scheduled_for, status, responded_at, created_at)" +
        " VALUES (?,?,?,?,?,?,?)",
      ct, nonce, e.ref_id ?? null, e.scheduled_for, e.status, e.responded_at ?? null, e.created_at ?? nowIso()
    );
  }
  for (const r of (data.pregnancy_test_reminders ?? []) as Record<string, unknown>[]) {
    const enc = r.note ? crypto.encryptText(key, String(r.note)) : { nonce: null, ct: null };
    db.run(
      "INSERT INTO pregnancy_test_reminder(date, note_enc, nonce, done, created_at) VALUES (?,?,?,?,?)",
      r.date, enc.ct, enc.nonce, r.done ? 1 : 0, nowIso()
    );
  }
}

// ---------- backup file ----------

export function makeBackup(db: Db, dataDir: string, passphrase: string, destPath?: string): string {
  const payload = Buffer.from(JSON.stringify(exportData(db, dataDir)), "utf8");
  const salt = crypto.randomBytes(16);
  const key = crypto.deriveKey(passphrase, salt);
  const { nonce, ct } = crypto.encrypt(key, payload);
  const header = {
    magic: MAGIC, version: FORMAT_VERSION, kdf: "scrypt",
    n: crypto.SCRYPT.N, r: crypto.SCRYPT.r, p: crypto.SCRYPT.p,
    salt: salt.toString("hex"), nonce: nonce.toString("hex"),
  };
  const out =
    destPath ??
    path.join(dataDir, `backup-${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)}.pushybackup`);
  fs.writeFileSync(out, Buffer.concat([Buffer.from(JSON.stringify(header) + "\n"), ct]));
  return out;
}

export function readBackup(backupPath: string, passphrase: string): Record<string, unknown> {
  const raw = fs.readFileSync(backupPath);
  const nl = raw.indexOf(0x0a);
  const header = JSON.parse(raw.subarray(0, nl).toString("utf8"));
  if (header.magic !== MAGIC) apiError(400, "invalid_backup", "not a .pushybackup file");
  if (header.version !== FORMAT_VERSION) {
    apiError(400, "invalid_backup", `unsupported backup version ${header.version}`);
  }
  const key = crypto.deriveKey(passphrase, Buffer.from(header.salt, "hex"));
  const plain = crypto.decryptOrRaise(key, Buffer.from(header.nonce, "hex"), raw.subarray(nl + 1));
  return JSON.parse(plain.toString("utf8"));
}

// ---------- storage report / lock ----------

export function storageReport(paths: { db?: string; libraryDb?: string; key?: string; model?: string }) {
  const size = (p?: string) => (p && fs.existsSync(p) ? fs.statSync(p).size : 0);
  const parts = {
    pushy_db_bytes: size(paths.db),
    library_db_bytes: size(paths.libraryDb),
    key_bytes: size(paths.key),
    model_bytes: size(paths.model),
  };
  return { ...parts, total_bytes: Object.values(parts).reduce((a, b) => a + b, 0) };
}

export function lock(db: Db, passphrase: string): { locked: true } {
  if (!passphrase) apiError(400, "validation_error", "A passphrase is required.");
  db.run("UPDATE profile SET app_lock_hash=? WHERE id=1", crypto.hashPassphrase(passphrase));
  return { locked: true };
}

/** Returns true if unlocked (or no lock set); throws on wrong passphrase. */
export function unlock(db: Db, passphrase: string): { unlocked: true } {
  const row = db.get("SELECT app_lock_hash FROM profile WHERE id=1");
  if (!row || !row.app_lock_hash) return { unlocked: true };
  if (!crypto.verifyPassphrase(passphrase, String(row.app_lock_hash))) {
    apiError(400, "bad_passphrase", "Wrong passphrase.");
  }
  return { unlocked: true };
}
