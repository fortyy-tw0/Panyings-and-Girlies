# siklo-backend-ts

SikLo's backend logic in TypeScript — the **on-device** core. No HTTP, no server: the phone app calls these functions directly. Same logic, same JSON shapes, and same crypto byte-format as `siklo-backend` (the Python/FastAPI reference implementation), so encrypted backups made by one can be restored by the other.

## What's here

```
src/
├── api.ts          createApi() — the facade every screen calls
├── db.ts           Db interface + SQLite schema + migrations
├── db.node.ts      Node adapter (built-in node:sqlite) — tests, dev, desktop
├── db.opsqlite.ts  React Native adapter for @op-engineering/op-sqlite — the phone
├── crypto.ts       AES-256-GCM field encryption, scrypt keys, passphrase hashing
├── errors.ts       ApiError(status, code, message)
├── dates.ts        ISO date helpers
├── prediction.ts   Deterministic cycle math — estimate, window, confidence, flags
├── records.ts      Onboarding, periods (kind/end_state), daily logs, notes, activity
├── reminders.ts    Pill reminders, due events, taken/skipped/missed, pregnancy-test
├── chat.ts         Chat session storage: retention off|7d|30d|manual + consent
└── privacy.ts      Export, encrypted backup/restore, wipe
```

## Usage (React Native)

```ts
import { createApi, opSqliteDb } from "siklo-backend-ts";
import { open } from "@op-engineering/op-sqlite";

const api = createApi(opSqliteDb(open({ name: "siklo.db", encryptionKey })), {
  dataDir: FileSystem.documentDirectory + "siklo/",
  paths: { db: "...", key: "...", model: "..." },
});

api.createPeriod({ start_date: "2026-10-01", flow_level: 2 });
const { status, estimate, window, confidence } = api.getNextPrediction();
// status === 'not_enough_information' → show "Not enough information", no estimate
```

The frontend's `src/api.ts` currently fetches HTTP to the laptop — replace each `fetch` call with the matching `api.*` call above. Same request/response shapes.

## Rules the frontend contract relies on

- **One prediction engine.** Calendar, Insights, reminders, and the companion all read the same `compute()` result. A prediction exists only when there are **3+ valid completed intervals** (15–90 days each); otherwise `status: "not_enough_information"` — never a fabricated 28-day estimate, never a "safe days" claim.
- **Richer records preserved.** Period rows carry `kind` (`period` | `spotting` — spotting never feeds predictions) and `end_state` (`ended` | `ongoing` | `unknown`). Symptom logs: no row = *not recorded*, `value: "none"` = *none*, anything else = *present*.
- **Chat retention is the user's choice.** `startChatSession({ retention })`: `"off"` (RAM-only, never written to disk — default), `"7d"`, `"30d"`, or `"manual"`. Persisted chat text is AES-GCM-encrypted; expired sessions are swept automatically. `setChatRetention` migrates a session between RAM and DB both ways.
- **Consent per conversation, per data type.** `setChatConsent(sessionId, { records: true, notes: true })`. The companion reads user data **only** through `api.getCompanionContext(sessionId)` — it returns exactly the consented data types for that session and nothing else.

Every function throws `ApiError` with `{status, code, message}` — same codes as the HTTP version (`overlap`, `category_disabled`, `invalid_backup`, …). Catch once at the UI layer.

## Running locally

```powershell
cd siklo-backend-ts
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest — 35 tests, in-memory DB
npx vite-node demo.ts # interactive menu against a real siklo.db file
```

## Crypto & RN notes

`crypto.ts` uses `node:crypto` (`webcrypto` is also fine — AES-GCM + scryptSync). On the phone, swap it for `react-native-quick-crypto` (same API surface) or keep node:crypto via a polyfill. `db.opsqlite.ts` is written against `@op-engineering/op-sqlite`'s synchronous `execute` API — verify against your installed version before wiring it up.

## Still owned by the AI teammate

The local LLM itself (`llama.rn` / `ctx.completion`), safety/crisis checks, prompts, and the knowledge library. This package stores chat history and gates record access — it never calls a model.
