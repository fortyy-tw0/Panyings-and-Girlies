# pushy-core

Pu-shy's backend logic in TypeScript — the **Option C** port. No HTTP, no server: the phone app calls these functions directly. Same logic, same JSON shapes, and same crypto byte-format as `pushy-backend` (the Python/FastAPI reference implementation), so encrypted backups made by one can be restored by the other.

## What's here

```
src/
├── api.ts          createApi() — the facade. One function per endpoint in api-contract.md.
├── db.ts           Db interface + SQLite schema (initDb creates tables + default categories)
├── db.node.ts      Node adapter (built-in node:sqlite) — tests, dev, desktop
├── db.opsqlite.ts  React Native adapter for op-sqlite — what the phone uses
├── crypto.ts       AES-256-GCM field encryption, scrypt keys, passphrase hashing
├── errors.ts       ApiError(status, code, message) — same shape as the HTTP {"error":{...}}
├── dates.ts        ISO date helpers
├── prediction.ts   Deterministic cycle math — estimate, window, confidence, flags
├── records.ts      Onboarding, periods, daily logs, notes, activity, contraception
├── reminders.ts    Pill reminders, due events, taken/skipped/missed, pregnancy-test reminders
└── privacy.ts      Export, encrypted backup/restore, wipe, app lock
```

## Usage (React Native)

```ts
import { createApi, opSqliteDb } from "pushy-core";
import { open } from "op-sqlite";

const api = createApi(opSqliteDb(open({ name: "pushy.db", encryptionKey })), {
  dataDir: FileSystem.documentDirectory + "pushy/",
  paths: { db: "...", key: "...", model: "..." },
});

api.createPeriod({ start_date: "2026-10-01", flow_level: 2 });
const { estimate, window, confidence } = api.getNextPrediction();
```

Every function that reads personal data throws `ApiError` with `{status, code, message}` — same codes as the HTTP version (`overlap`, `locked`, `category_disabled`, `invalid_backup`, …). Catch once at the UI layer.

## Running locally

```powershell
cd pushy-core
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest — 25 tests, in-memory DB
```

## Crypto & RN notes

`crypto.ts` uses `node:crypto` (`webcrypto` is also fine — AES-GCM + scryptSync). On the phone, swap it for `react-native-quick-crypto` (same API surface) or keep node:crypto via a polyfill. `db.opsqlite.ts` is written against op-sqlite's synchronous `execute` API — verify against your installed version before wiring it up.

## Still owned by the AI teammate

Chat sessions (RAM-only), the local LLM wrapper (`llama.rn`), safety checks, and the educational library. This package deliberately has no chat persistence — `getStatsForAi()` is the only AI-facing surface here.
