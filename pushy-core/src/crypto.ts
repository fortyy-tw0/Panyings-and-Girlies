/**
 * Field-level encryption — same algorithms and byte layout as the Python
 * backend (AES-256-GCM, scrypt N=2^15 r=8 p=1, ciphertext || 16-byte tag),
 * so a .pushybackup made by one implementation restores in the other.
 *
 * This file uses node:crypto. On React Native, swap the internals for
 * @noble/ciphers (aes-gcm) + scrypt-js + react-native-get-random-values —
 * keep these function signatures and nothing else changes.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export { randomBytes } from "node:crypto";

export const SCRYPT = { N: 2 ** 15, r: 8, p: 1 } as const;

export class WrongPassphrase extends Error {}

export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });
}

export function hashPassphrase(passphrase: string, salt?: Buffer): string {
  const s = salt ?? randomBytes(16);
  return `${s.toString("hex")}:${deriveKey(passphrase, s).toString("hex")}`;
}

export function verifyPassphrase(passphrase: string, stored: string): boolean {
  const [saltHex, dkHex] = stored.split(":");
  try {
    return deriveKey(passphrase, Buffer.from(saltHex, "hex")).toString("hex") === dkHex;
  } catch {
    return false;
  }
}

export function encrypt(key: Buffer, data: Buffer): { nonce: Buffer; ct: Buffer } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return { nonce, ct: Buffer.concat([body, cipher.getAuthTag()]) };
}

export function decrypt(key: Buffer, nonce: Buffer, ct: Buffer): Buffer {
  const tag = ct.subarray(ct.length - 16);
  const body = ct.subarray(0, ct.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function encryptText(key: Buffer, text: string): { nonce: Buffer; ct: Buffer } {
  return encrypt(key, Buffer.from(text, "utf8"));
}

export function decryptText(key: Buffer, nonce: Buffer, ct: Buffer): string {
  return decrypt(key, nonce, ct).toString("utf8");
}

export function decryptOrRaise(key: Buffer, nonce: Buffer, ct: Buffer): Buffer {
  try {
    return decrypt(key, nonce, ct);
  } catch {
    throw new WrongPassphrase("wrong passphrase or corrupted backup");
  }
}

/** Master field-encryption key stored in <dataDir>/pushy.key (baseline). */
export function appKey(dataDir: string): Buffer {
  const keyPath = path.join(dataDir, "pushy.key");
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath);
  fs.mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}
