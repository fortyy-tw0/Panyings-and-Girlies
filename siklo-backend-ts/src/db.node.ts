/**
 * Node adapter for the Db interface — uses the built-in node:sqlite driver.
 * For tests and any desktop/dev use. The phone uses db.opsqlite.ts instead.
 */

import { createRequire } from "node:module";
import type { Db } from "./db";

// node:sqlite is too new for some bundlers' builtin lists — load it via require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

function bind(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  return v ?? null;
}

export function openDb(path = ":memory:"): Db {
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA foreign_keys=ON");
  raw.exec("PRAGMA secure_delete=ON");
  return {
    exec: (sql) => raw.exec(sql),
    run: (sql, ...params) =>
      Number(raw.prepare(sql).run(...(params.map(bind) as never[])).changes),
    get: (sql, ...params) =>
      raw.prepare(sql).get(...(params.map(bind) as never[])) as never,
    all: (sql, ...params) =>
      raw.prepare(sql).all(...(params.map(bind) as never[])) as never[],
  };
}
