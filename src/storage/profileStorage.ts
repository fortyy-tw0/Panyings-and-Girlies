import * as SecureStore from 'expo-secure-store';

import { isValidCalendarDate } from '../lib/calendarDate';
import {
  CHAT_RETENTIONS,
  CONTRACEPTION_CONTEXTS,
  CYCLE_PATTERNS,
  DIAGNOSIS_ANSWERS,
  LANGUAGES,
  LIFE_STAGE_CONTEXTS,
  TONES,
} from '../types/profile';
import type { LocalProfile, PeriodAnswer } from '../types/profile';

/**
 * On-device persistence for the local profile.
 *
 * Uses expo-secure-store (iOS Keychain / Android Keystore-backed storage),
 * restricted to this device and only while it is unlocked. Nothing leaves the device.
 *
 * Limits to know about:
 * - SecureStore is meant for small values (iOS warns above ~2 KB). The setup
 *   profile is small and the concern note is capped at 500 characters. Period
 *   and symptom records will need a different on-device store later.
 * - On iOS, Keychain items can remain after the app is uninstalled. This is not
 *   a backup and must not be presented as one; handle it before release
 *   (see README "Known limitations").
 */

const PROFILE_KEY = 'siklo.profile.v1';

const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === 'string' && allowed.some((option) => option === value);

const isPeriodAnswer = (value: unknown): value is PeriodAnswer => {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  switch (value.kind) {
    case 'dont_remember':
    case 'not_recorded':
    case 'skipped':
      return true;
    case 'known':
      return (
        'start' in value &&
        'end' in value &&
        'ongoing' in value &&
        isValidCalendarDate(value.start) &&
        (value.end === null || isValidCalendarDate(value.end)) &&
        typeof value.ongoing === 'boolean'
      );
    default:
      return false;
  }
};

/** Reads an own property as `unknown` without asserting the object's shape. */
const field = (obj: object, key: keyof LocalProfile): unknown =>
  Object.getOwnPropertyDescriptor(obj, key)?.value;

const isLocalProfile = (value: unknown): value is LocalProfile => {
  if (typeof value !== 'object' || value === null) return false;
  const concernNote = field(value, 'concernNote');
  return (
    field(value, 'schemaVersion') === 1 &&
    typeof field(value, 'savedAt') === 'string' &&
    isOneOf(field(value, 'cyclePattern'), CYCLE_PATTERNS) &&
    isOneOf(field(value, 'diagnosis'), DIAGNOSIS_ANSWERS) &&
    (concernNote === null || typeof concernNote === 'string') &&
    isOneOf(field(value, 'contraception'), CONTRACEPTION_CONTEXTS) &&
    isOneOf(field(value, 'lifeStage'), LIFE_STAGE_CONTEXTS) &&
    isPeriodAnswer(field(value, 'period')) &&
    isOneOf(field(value, 'language'), LANGUAGES) &&
    isOneOf(field(value, 'tone'), TONES) &&
    isOneOf(field(value, 'chatRetention'), CHAT_RETENTIONS)
  );
};

export class ProfileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileReadError';
  }
}

/** Returns the saved profile, `null` if none exists, or throws if stored data is unreadable. */
export const loadProfile = async (): Promise<LocalProfile | null> => {
  const raw = await SecureStore.getItemAsync(PROFILE_KEY, storeOptions);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProfileReadError('Saved profile could not be read.');
  }
  if (!isLocalProfile(parsed)) {
    throw new ProfileReadError('Saved profile is in an unexpected format.');
  }
  return parsed;
};

export const saveProfile = async (profile: LocalProfile): Promise<void> => {
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile), storeOptions);
};

export const deleteProfile = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(PROFILE_KEY, storeOptions);
};
