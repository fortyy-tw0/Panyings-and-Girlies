/**
 * Public entry point — what the React Native app imports.
 *
 * Phone:      createApi(opSqliteDb(open({ name: "siklo.db", encryptionKey })), { dataDir, paths })
 * Laptop/test: createApi(openDb(":memory:"), { dataDir })
 */

export { createApi, type SikloApi, type ApiOptions } from "./api";
export { openDb } from "./db.node";
export { opSqliteDb } from "./db.opsqlite";
export { initDb, SCHEMA, type Db } from "./db";
export { ApiError, apiError } from "./errors";
export type { Retention, Consent, ConsentKey, ChatMessage, ChatRole } from "./chat";
export {
  compute as computePrediction,
  getStatsForAi,
  flagMessages,
  type PeriodRow,
  type Prediction,
} from "./prediction";
