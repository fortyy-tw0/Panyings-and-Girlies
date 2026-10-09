/**
 * Reference adapter for op-sqlite on React Native (Option C).
 *
 * Typed loosely on purpose so this file compiles without the op-sqlite
 * package installed. In the RN app:
 *
 *   import { open } from 'op-sqlite';
 *   const raw = open({ name: 'siklo.db', encryptionKey });
 *   const db = opSqliteDb(raw);
 *
 * For whole-DB encryption use op-sqlite's SQLCipher build instead of the
 * field-level crypto in crypto.ts (v2.1 Section 8).
 */

import type { Db } from "./db";

type OpSqliteRaw = {
  execute(sql: string, params?: unknown[]): {
    rows: { length: number; item(i: number): Record<string, unknown> } | Record<string, unknown>[];
    rowsAffected?: number;
  };
  executeSync?(sql: string, params?: unknown[]): unknown;
};

function rowsOf(result: { rows: unknown }): Record<string, unknown>[] {
  const rows = (result as { rows: { length: number; item(i: number): Record<string, unknown> } | Record<string, unknown>[] }).rows;
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
        raw.execute(stmt);
      }
    },
    run: (sql, ...params) => raw.execute(sql, norm(params)).rowsAffected ?? 0,
    get: (sql, ...params) => rowsOf(raw.execute(sql, norm(params)))[0] as never,
    all: (sql, ...params) => rowsOf(raw.execute(sql, norm(params))) as never[],
  };
}
