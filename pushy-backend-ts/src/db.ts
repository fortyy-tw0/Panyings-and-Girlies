/**
 * Database layer. Same schema as pushy-backend (Python).
 *
 * The `Db` interface is the seam: on the phone it is backed by op-sqlite
 * (see db.opsqlite.ts), in tests by node:sqlite (see db.node.ts). All
 * services only ever see this interface.
 */

export interface Db {
  exec(sql: string): void;
  /** Returns number of rows changed (for DELETE/UPDATE checks). */
  run(sql: string, ...params: unknown[]): number;
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_meta(
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS profile(
    id INTEGER PRIMARY KEY CHECK(id = 1),
    language TEXT DEFAULT 'en',
    cycle_type TEXT,
    enabled_categories_json TEXT DEFAULT '[]',
    app_lock_hash TEXT,
    discreet_notifications INTEGER DEFAULT 1,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS health_context(
    id INTEGER PRIMARY KEY,
    payload_enc BLOB,           -- AES-GCM({kind, condition_name, status});
                                -- status enum enforced in code before encryption
    nonce BLOB,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS period(
    id INTEGER PRIMARY KEY,
    start_date TEXT NOT NULL,
    end_date TEXT,              -- NULL = period still ongoing
    flow_level INTEGER,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS symptom_category(
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE,
    label TEXT,
    is_custom INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS daily_log(
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES symptom_category(id),
    value TEXT,
    note_enc BLOB,
    nonce BLOB,
    UNIQUE(date, category_id)
);

CREATE TABLE IF NOT EXISTS note(
    id INTEGER PRIMARY KEY,
    date TEXT,
    text_enc BLOB,
    nonce BLOB,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS sexual_activity(
    id INTEGER PRIMARY KEY,
    payload_enc BLOB NOT NULL,  -- AES-GCM({date, contraception, note})
    nonce BLOB,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS contraception_pref(
    id INTEGER PRIMARY KEY CHECK(id = 1),
    payload_enc BLOB,           -- AES-GCM({uses_pills, method})
    nonce BLOB,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS pill_reminder(
    id INTEGER PRIMARY KEY CHECK(id = 1),
    enabled INTEGER DEFAULT 0,
    paused INTEGER DEFAULT 0,
    payload_enc BLOB,           -- AES-GCM({time_local, discreet_text})
    nonce BLOB,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS reminder_event(
    id INTEGER PRIMARY KEY,
    reminder_type_enc BLOB,     -- AES-GCM('pill' | 'pregnancy_test')
    nonce BLOB,
    ref_id INTEGER,
    scheduled_for TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'taken', 'skipped', 'missed')),
    responded_at TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS pregnancy_test_reminder(
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    note_enc BLOB,
    nonce BLOB,
    done INTEGER DEFAULT 0,
    created_at TEXT
);
`;

export const DEFAULT_CATEGORIES: [string, string][] = [
  ["flow", "Flow"],
  ["cramps", "Cramps"],
  ["mood", "Mood"],
  ["energy", "Energy"],
  ["sleep", "Sleep"],
  ["headache", "Headache"],
  ["bloating", "Bloating"],
];

export function initDb(db: Db): void {
  db.exec(SCHEMA);
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("PRAGMA secure_delete=ON");
  db.run("INSERT OR IGNORE INTO profile(id, created_at) VALUES (1, ?)", nowIso());
  for (const [key, label] of DEFAULT_CATEGORIES) {
    db.run(
      "INSERT OR IGNORE INTO symptom_category(key, label, is_custom, enabled) VALUES (?,?,0,1)",
      key, label
    );
  }
  db.run("INSERT OR IGNORE INTO contraception_pref(id) VALUES (1)");
}

export function nowIso(): string {
  return localIso(new Date());
}

/** "YYYY-MM-DDTHH:MM:SS" in local time — same format the Python backend stores. */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
