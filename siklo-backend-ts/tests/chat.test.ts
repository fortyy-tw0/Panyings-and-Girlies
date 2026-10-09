import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createApi, type SikloApi } from "../src/api";
import { openDb } from "../src/db.node";
import type { Db } from "../src/db";

let api: SikloApi;
let db: Db;
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "siklo-"));
  db = openDb(":memory:");
  api = createApi(db, { dataDir });
});

describe("chat retention", () => {
  it("default 'off' sessions never touch the DB", () => {
    const s = api.startChatSession();
    api.addChatMessage(s.session_id, { role: "user", text: "secret vent" });
    expect(api.getChatMessages(s.session_id)[0].text).toBe("secret vent");
    // nothing persisted
    expect(db.all("SELECT * FROM chat_session")).toEqual([]);
    expect(db.all("SELECT * FROM chat_message")).toEqual([]);
    // listed as transient
    expect(api.listChatSessions()[0].retention).toBe("off");
  });

  it("30d sessions persist encrypted and decrypt on read", () => {
    const s = api.startChatSession({ retention: "30d" });
    api.addChatMessage(s.session_id, { role: "user", text: "my private chat" });
    api.addChatMessage(s.session_id, { role: "assistant", text: "reply", sources: [{ title: "a" }] });

    const msgs = api.getChatMessages(s.session_id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe("my private chat");
    expect(msgs[1].sources).toEqual([{ title: "a" }]);

    // ciphertext in the db, not plaintext
    const raw = db.get<{ text_enc: Buffer }>("SELECT text_enc FROM chat_message")!;
    expect(raw.text_enc.toString()).not.toContain("private");
  });

  it("switching off → 7d migrates RAM into DB; 7d → off deletes rows", () => {
    const s = api.startChatSession(); // off
    api.addChatMessage(s.session_id, { role: "user", text: "carry me" });

    api.setChatRetention(s.session_id, "7d");
    expect(db.get("SELECT expires_at FROM chat_session WHERE id=?", s.session_id)?.expires_at).toBeTruthy();
    expect(db.get("SELECT role FROM chat_message WHERE session_id=?", s.session_id)).toBeTruthy();

    api.setChatRetention(s.session_id, "off");
    expect(db.all("SELECT * FROM chat_session")).toEqual([]);
    expect(api.getChatMessages(s.session_id)[0].text).toBe("carry me"); // still in RAM
  });

  it("expired sessions are swept", () => {
    const s = api.startChatSession({ retention: "7d" });
    api.addChatMessage(s.session_id, { role: "user", text: "x" });
    db.run("UPDATE chat_session SET expires_at='2000-01-01T00:00:00' WHERE id=?", s.session_id);
    api.listChatSessions(); // triggers sweep
    expect(db.all("SELECT * FROM chat_session")).toEqual([]);
    expect(() => api.getChatMessages(s.session_id)).toThrowError(
      expect.objectContaining({ status: 404 })
    );
  });

  it("endSession wipes the chat", () => {
    const s = api.startChatSession({ retention: "manual" });
    api.addChatMessage(s.session_id, { role: "user", text: "gone" });
    api.endChatSession(s.session_id);
    expect(api.listChatSessions()).toEqual([]);
    expect(db.all("SELECT * FROM chat_message")).toEqual([]);
  });
});

describe("companion consent", () => {
  it("companion sees nothing without consent, only consented types with it", () => {
    api.createNote({ date: "2026-10-01", text: "private" });
    api.createPeriod({ start_date: "2026-09-01", end_date: "2026-09-05" });

    const s = api.startChatSession({ retention: "30d" });
    expect(api.getCompanionContext(s.session_id).cycle).toBeUndefined();
    expect(api.getCompanionContext(s.session_id).notes).toBeUndefined();

    api.setChatConsent(s.session_id, { records: true });
    const ctx = api.getCompanionContext(s.session_id);
    expect((ctx.cycle as { last_period_start: string }).last_period_start).toBe("2026-09-01");
    expect(ctx.notes).toBeUndefined(); // notes still not consented

    api.setChatConsent(s.session_id, { notes: true });
    expect(api.getCompanionContext(s.session_id).notes).toHaveLength(1);
  });

  it("consent is per-session — a new chat starts with none", () => {
    const a = api.startChatSession();
    api.setChatConsent(a.session_id, { records: true });
    const b = api.startChatSession();
    expect(api.getChatConsent(b.session_id)).toEqual({});
    expect(api.getCompanionContext(b.session_id).cycle).toBeUndefined();
  });

  it("persisted chats round-trip through backup", () => {
    const s = api.startChatSession({ retention: "manual" });
    api.addChatMessage(s.session_id, { role: "user", text: "saved chat" });
    const backupPath = api.backup("pw", path.join(dataDir, "b.siklobackup")).path;

    api.deleteAll();
    expect(api.listChatSessions()).toEqual([]);

    api.restore("pw", backupPath);
    const sessions = api.listChatSessions();
    expect(sessions).toHaveLength(1);
    expect(api.getChatMessages(sessions[0].id as string)[0].text).toBe("saved chat");
  });
});
