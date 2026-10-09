# Pu-shy API Contract (v2)

Base URL: `http://127.0.0.1:8420` — localhost only, no internet required.
All bodies are JSON. Dates are `YYYY-MM-DD`; times are `HH:MM` (local); datetimes are ISO `YYYY-MM-DDTHH:MM:SS`.

**Error format (all endpoints):**

```json
{ "error": { "code": "validation_error|overlap|not_found|locked|bad_passphrase", "message": "human-readable" } }
```

HTTP codes: `400` validation · `404` missing · `409` conflict (e.g. overlapping period) · `423` locked.

Endpoints marked **[B2 pending]** are implemented by the AI developer; the JSON shapes below are the agreed contract.

---

## Records

### `POST /onboarding`
```json
// request
{ "language": "en|fil", "cycle_type": "regular|irregular|not_sure",
  "health_context": [{"kind": "condition", "condition_name": "PCOS",
                      "status": "diagnosed_user_reported|suspected_not_diagnosed|prefer_not_to_say"}],
  "enabled_categories": ["flow", "cramps", "mood"] }
// response 200
{ "profile": {"id": 1, "language": "en", "cycle_type": "irregular", "enabled_categories": ["flow","cramps"]} }
```

### `GET /periods` → `[{id, start_date, end_date, flow_level}]` (`end_date: null` = ongoing)
### `POST /periods` — `{start_date, end_date?, flow_level?}` → `{period}` · `409 overlap` if dates collide
### `PUT /periods/{id}` — same body → `{period}`
### `DELETE /periods/{id}` → `204`

### `GET /logs?date=YYYY-MM-DD` → `[{id, date, category, value, note}]`
### `POST /logs` — `{date, category, value?, note?}` → `{log}` · upsert: one row per (date, category)

### `GET /categories` → `[{key, label, is_custom, enabled}]`
### `PUT /categories` — `{updates?: [{key, enabled}], add?: [{key, label}]}` → same as GET

### `GET /notes?date=` → `[{id, date, text, created_at}]`
### `POST /notes` — `{date?, text}` → `{note}` · stored encrypted
### `DELETE /notes/{id}` → `204`

## Predictions & insights (deterministic — no AI)

### `GET /predictions/next`
```json
{ "status": "ok|need_more_history", "estimate": "2026-10-29",
  "window": ["2026-10-25", "2026-11-03"], "confidence": "low",
  "expected_duration": 5, "flags": ["high_variability"] }
```
### `GET /predictions/explain` → `{dates_used[], cycle_lengths[], formula}` — for "Why this prediction?"
### `GET /insights` → stats + `pattern_flags: [{key, message}]` (fixed neutral text) + `symptom_patterns[]`

## Sexual activity & contraception (optional, encrypted)

### `GET /activity` → `[{id, date, contraception, note}]`
### `POST /activity` — `{date, contraception?, note?}` · contraception ∈ `condom|pills|other|none|not_sure` (all optional)
### `DELETE /activity/{id}` → `204`
### `GET /contraception` → `{uses_pills, method}`
### `PUT /contraception` — `{uses_pills: bool, method?}`

## Reminders (user-entered schedules only — never suggested)

### `GET /reminders/pill` → `{enabled, time_local, discreet_text, paused}`
### `PUT /reminders/pill` — `{enabled, time_local: "21:30", discreet_text?, paused}`
### `GET /reminders/due?at=<iso>` → `[{event_id, type, text}]` (`at` is a debug override for tests)
### `POST /reminders/events/{id}/respond` — `{status: "taken|skipped"}` · "missed" is set by backend sweep (2h grace)
### `GET /reminders/history?days=30` → `[{id, type, scheduled_for, status, responded_at}]`
### `GET /reminders/pregnancy-test` → `[{id, date, note, done}]`
### `POST /reminders/pregnancy-test` — `{date, note?}` → `{reminder}` · creates one reminder_event on that date
### `DELETE /reminders/pregnancy-test/{id}` → `204`

## Companion — sessions in RAM only **[B2 pending]**

Nothing is persisted: no tables, no files, no backups, no log lines. Sessions die on process exit.

### `POST /chat/sessions` — `{mode?}` → `{session_id}`
### `POST /chat/sessions/{id}/messages` — `{text, mode?}` → `{reply, intent, sources[], needs_consent}`
### `GET /chat/sessions/{id}/messages` → `[{role, text, sources[]}]` — repaint active chat after screen switch
### `POST /chat/sessions/{id}/consent` → `{records_consent: true}` — enables RECORDS mode for this session
### `DELETE /chat/sessions/{id}` → `204` — ends chat, wiped from RAM
### `GET /chat/sessions` → `[{session_id, mode, created_at}]` — `[]` after restart

## Library **[B2 pending]**

### `GET /library/search?q=` → `{results: [{passage_id, text, source:{org,title,url,reviewed_at}}]}` or `{results: []}`
### `GET /library/info` → `{version, article_count, passage_count, built_at}`

## Privacy & storage

### `GET /storage` → `{pushy_db_bytes, library_db_bytes, model_bytes, key_bytes, total_bytes}`
### `GET /export` → JSON dump of all user data (decrypted; chats never exist on disk)
### `POST /backup` — `{passphrase}` → `{path, bytes}` · writes `data/backup-<date>.pushybackup`
### `POST /restore` — `{passphrase, path}` → `{restored: true}` · `400 bad_passphrase` on wrong key
### `DELETE /all` — `{delete_model?: bool}` → `204` · wipes all user tables + in-memory chats
### `POST /lock` — `{passphrase}` → `{locked: true}`
### `POST /unlock` — `{passphrase}` → `{unlocked: true}` · `400` on wrong passphrase

## System

### `GET /health` → `{status: "ok", offline: true, db: "ok", model_loaded: bool}`
