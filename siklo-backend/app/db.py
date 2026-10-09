import os
import sqlite3

SCHEMA = """
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
                                -- (a CHECK constraint can't see inside ciphertext)
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
    UNIQUE(date, category_id)   -- one row per category per day; re-logging updates it
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
    payload_enc BLOB,           -- AES-GCM({time_local: "HH:MM", discreet_text})
    nonce BLOB,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS reminder_event(
    id INTEGER PRIMARY KEY,
    reminder_type_enc BLOB,     -- AES-GCM('pill' | 'pregnancy_test')
    nonce BLOB,
    ref_id INTEGER,               -- pregnancy_test_reminder.id when applicable
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
"""

DEFAULT_CATEGORIES = [
    ("flow", "Flow"),
    ("cramps", "Cramps"),
    ("mood", "Mood"),
    ("energy", "Energy"),
    ("sleep", "Sleep"),
    ("headache", "Headache"),
    ("bloating", "Bloating"),
]


def data_dir():
    return os.environ.get(
        "PUSHY_DATA_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
    )


def db_path():
    return os.path.join(data_dir(), "pushy.db")


def library_db_path():
    return os.path.join(data_dir(), "library.db")


def key_path():
    return os.path.join(data_dir(), "pushy.key")


def connect():
    os.makedirs(data_dir(), exist_ok=True)
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA secure_delete=ON")
    return conn


def init_db():
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT OR IGNORE INTO profile(id, created_at) VALUES (1, datetime('now'))"
        )
        conn.executemany(
            "INSERT OR IGNORE INTO symptom_category(key, label, is_custom, enabled)"
            " VALUES (?, ?, 0, 1)",
            DEFAULT_CATEGORIES,
        )
        conn.execute(
            "INSERT OR IGNORE INTO contraception_pref(id) VALUES (1)"
        )
        conn.commit()
    finally:
        conn.close()
