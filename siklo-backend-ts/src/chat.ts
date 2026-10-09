/**
 * Chat sessions — storage, retention, and consent. The AI layer lives in the
 * app (llama.rn); this module only remembers what the user chose to keep.
 *
 * Retention: 'off' sessions live in RAM (a Map on the api object) and vanish
 * with the process — nothing is ever written to disk. '7d'/'30d'/'manual'
 * sessions are persisted with encrypted message text, swept by expiry.
 *
 * Consent is per session and per data type. The companion reads user data
 * ONLY through getCompanionContext() — there is no other door.
 */

import type { Db } from "./db";
import { localIso, nowIso } from "./db";
import { apiError } from "./errors";
import * as crypto from "./crypto";
import { getStatsForAi } from "./prediction";
import { listNotes, listActivity } from "./records";
import { randomUUID } from "node:crypto";

export type Retention = "off" | "7d" | "30d" | "manual";
export type ConsentKey = "records" | "notes" | "activity" | "health_context";
export type Consent = Partial<Record<ConsentKey, boolean>>;
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  text: string;
  sources?: unknown[];
  created_at?: string;
}

interface RamSession {
  id: string;
  mode: string;
  consent: Consent;
  messages: ChatMessage[];
  created_at: string;
}

/** In-memory sessions for retention='off'. Owned per api instance. */
export type RamChats = Map<string, RamSession>;

export function newRamStore(): RamChats {
  return new Map();
}

const RETENTION_DAYS: Record<string, number | null> = {
  off: null, // never persisted
  "7d": 7,
  "30d": 30,
  manual: null, // persisted, no expiry
};

function expiryFor(retention: Retention): string | null {
  const days = RETENTION_DAYS[retention];
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localIso(d);
}

function checkRetention(r: string): asserts r is Retention {
  if (!(r in RETENTION_DAYS)) apiError(400, "validation_error", `Invalid retention '${r}'.`);
}

/** Remove persisted sessions past their expiry. Cheap; call often. */
export function sweepExpired(db: Db): void {
  db.run("DELETE FROM chat_session WHERE expires_at IS NOT NULL AND expires_at < ?", nowIso());
}

export function startSession(
  db: Db,
  ram: RamChats,
  input: { mode?: string; retention?: Retention } = {}
) {
  const retention = input.retention ?? "off";
  checkRetention(retention);
  const id = randomUUID();
  const session = { session_id: id, mode: input.mode ?? "companion", retention };

  if (retention === "off") {
    ram.set(id, { id, mode: session.mode, consent: {}, messages: [], created_at: nowIso() });
    return session;
  }
  db.run(
    "INSERT INTO chat_session(id, mode, retention, consent_json, expires_at, created_at) VALUES (?,?,?,?,?,?)",
    id, session.mode, retention, "{}", expiryFor(retention), nowIso()
  );
  return session;
}

function getRamSession(ram: RamChats, id: string): RamSession | undefined {
  return ram.get(id);
}

function getDbSession(db: Db, id: string) {
  return db.get("SELECT * FROM chat_session WHERE id=?", id);
}

function mustSession(db: Db, ram: RamChats, id: string): "ram" | "db" {
  if (ram.has(id)) return "ram";
  if (getDbSession(db, id)) return "db";
  apiError(404, "not_found", "Chat session not found.");
}

export function addMessage(
  db: Db,
  ram: RamChats,
  dataDir: string,
  sessionId: string,
  input: { role: ChatRole; text: string; sources?: unknown[] }
) {
  const where = mustSession(db, ram, sessionId);
  if (where === "ram") {
    const s = ram.get(sessionId)!;
    s.messages.push({ role: input.role, text: input.text, sources: input.sources, created_at: nowIso() });
    return { stored: "memory" as const };
  }
  const { nonce, ct } = crypto.encryptText(crypto.appKey(dataDir), input.text);
  db.run(
    "INSERT INTO chat_message(session_id, role, text_enc, nonce, sources_json, created_at) VALUES (?,?,?,?,?,?)",
    sessionId, input.role, ct, nonce, input.sources ? JSON.stringify(input.sources) : null, nowIso()
  );
  return { stored: "db" as const };
}

export function getMessages(db: Db, ram: RamChats, dataDir: string, sessionId: string): ChatMessage[] {
  const where = mustSession(db, ram, sessionId);
  if (where === "ram") return [...ram.get(sessionId)!.messages];

  const key = crypto.appKey(dataDir);
  return db
    .all(
      "SELECT role, text_enc, nonce, sources_json, created_at FROM chat_message WHERE session_id=? ORDER BY id",
      sessionId
    )
    .map((r) => ({
      role: r.role as ChatRole,
      text: crypto.decryptText(key, r.nonce as Buffer, r.text_enc as Buffer),
      sources: r.sources_json ? JSON.parse(String(r.sources_json)) : undefined,
      created_at: String(r.created_at),
    }));
}

/**
 * Set consent for one or more data types on a single session.
 * setConsent(id, { records: true }) — consent never leaks across sessions.
 */
export function setConsent(db: Db, ram: RamChats, sessionId: string, consent: Consent) {
  const where = mustSession(db, ram, sessionId);
  if (where === "ram") {
    ram.get(sessionId)!.consent = { ...ram.get(sessionId)!.consent, ...consent };
    return getConsent(db, ram, sessionId);
  }
  const row = getDbSession(db, sessionId)!;
  const merged = { ...JSON.parse(String(row.consent_json)), ...consent };
  db.run("UPDATE chat_session SET consent_json=? WHERE id=?", JSON.stringify(merged), sessionId);
  return merged;
}

export function getConsent(db: Db, ram: RamChats, sessionId: string): Consent {
  const where = mustSession(db, ram, sessionId);
  if (where === "ram") return { ...ram.get(sessionId)!.consent };
  return JSON.parse(String(getDbSession(db, sessionId)!.consent_json));
}

/** Change retention. Moving to 'off' deletes persisted rows; leaving 'off' copies RAM into the DB. */
export function setRetention(db: Db, ram: RamChats, dataDir: string, sessionId: string, retention: Retention) {
  checkRetention(retention);
  const where = mustSession(db, ram, sessionId);

  if (where === "ram" && retention !== "off") {
    const s = ram.get(sessionId)!;
    db.run(
      "INSERT INTO chat_session(id, mode, retention, consent_json, expires_at, created_at) VALUES (?,?,?,?,?,?)",
      s.id, s.mode, retention, JSON.stringify(s.consent), expiryFor(retention), s.created_at
    );
    const key = crypto.appKey(dataDir);
    for (const m of s.messages) {
      const { nonce, ct } = crypto.encryptText(key, m.text);
      db.run(
        "INSERT INTO chat_message(session_id, role, text_enc, nonce, sources_json, created_at) VALUES (?,?,?,?,?,?)",
        s.id, m.role, ct, nonce, m.sources ? JSON.stringify(m.sources) : null, m.created_at ?? nowIso()
      );
    }
    ram.delete(sessionId);
    return { session_id: sessionId, retention };
  }

  if (where === "db" && retention === "off") {
    const row = getDbSession(db, sessionId)!;
    const messages = getMessages(db, ram, dataDir, sessionId).map(({ role, text, sources, created_at }) => ({
      role, text, sources, created_at,
    }));
    db.run("DELETE FROM chat_session WHERE id=?", sessionId);
    ram.set(sessionId, {
      id: sessionId,
      mode: String(row.mode),
      consent: JSON.parse(String(row.consent_json)),
      messages,
      created_at: String(row.created_at),
    });
    return { session_id: sessionId, retention };
  }

  if (where === "db") {
    db.run("UPDATE chat_session SET retention=?, expires_at=? WHERE id=?", retention, expiryFor(retention), sessionId);
  }
  return { session_id: sessionId, retention };
}

export function endSession(db: Db, ram: RamChats, sessionId: string): void {
  const where = mustSession(db, ram, sessionId);
  if (where === "ram") ram.delete(sessionId);
  else db.run("DELETE FROM chat_session WHERE id=?", sessionId);
}

export function listSessions(db: Db, ram: RamChats) {
  sweepExpired(db);
  const persisted = db.all(
    "SELECT id, mode, retention, expires_at, created_at FROM chat_session ORDER BY created_at DESC"
  );
  const transient = [...ram.values()].map((s) => ({
    id: s.id, mode: s.mode, retention: "off" as const, expires_at: null, created_at: s.created_at,
  }));
  return [...persisted, ...transient].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/**
 * The ONLY way the companion reads user data. Returns stats/payloads for
 * exactly the data types this session consented to — nothing else.
 */
export function getCompanionContext(db: Db, ram: RamChats, dataDir: string, sessionId: string) {
  const consent = getConsent(db, ram, sessionId);
  const out: Record<string, unknown> = { consent };
  if (consent.records) out.cycle = getStatsForAi(db);
  if (consent.notes) {
    out.notes = listNotes(db, dataDir).map((n) => ({ date: n.date, text: n.text }));
  }
  if (consent.activity) out.sexual_activity = listActivity(db, dataDir);
  if (consent.health_context) {
    const key = crypto.appKey(dataDir);
    out.health_context = db
      .all("SELECT payload_enc, nonce FROM health_context")
      .map((r) => JSON.parse(crypto.decryptText(key, r.nonce as Buffer, r.payload_enc as Buffer)));
  }
  return out;
}
