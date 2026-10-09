/**
 * Adapter for @op-engineering/op-sqlite on React Native (the phone DB).
 *
 * IMPORTANT: op-sqlite's `execute()` is ASYNC — use `executeSync()`, which
 * returns QueryResult synchronously and keeps the whole Db interface sync.
 * Verified against the frontend's usage: `open({ name, encryptionKey })`
 * then `d.executeSync(sql, params)`.
 *
 * In the RN app:
 *
 *   import { open } from '@op-engineering/op-sqlite';
 *   const raw = open({ name: 'siklo.db', encryptionKey });
 *   const db = opSqliteDb(raw);
 *
 * encryptionKey should come from expo-secure-store, never hard-coded.
 * (The frontend's current db.ts uses 'TEST-ONLY-change-me' — replace it.)
 */

import type { Db } from "./db";

type OpSqliteRaw = {
  executeSync(sql: string, params?: unknown[]): {
    rows?: { length: number; item(i: number): Record<string, unknown> } | Record<string, unknown>[];
    rowsAffected?: number;
  };
};

function rowsOf(result: { rows?: unknown }): Record<string, unknown>[] {
  const rows = result?.rows as
    | { length: number; item(i: number): Record<string, unknown> }
    | Record<string, unknown>[]
    | undefined;
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i++) out.push(rows.item(i));
  return out;
}

export function opSqliteDb(raw: OpSqliteRaw): Db {
  const norm = (params: unknown[]) =>
    params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p ?? null));
  return {
    exec: (sql) => {
      for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        raw.executeSync(stmt);
      }
    },
    run: (sql, ...params) => raw.executeSync(sql, norm(params)).rowsAffected ?? 0,
    get: (sql, ...params) => rowsOf(raw.executeSync(sql, norm(params)))[0] as never,
    all: (sql, ...params) => rowsOf(raw.executeSync(sql, norm(params))) as never[],
  };
}
