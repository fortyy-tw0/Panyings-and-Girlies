import type { CalendarDate } from '../lib/calendarDate';

/**
 * Self-reported setup answers. Every optional answer distinguishes:
 * - 'not_recorded' — the person saw the question and left it untouched
 * - 'skipped'      — the person tapped Skip for that step
 * Neither value is ever treated as a diagnosis or a fabricated date.
 */

export const CYCLE_PATTERNS = ['regular', 'irregular', 'unsure', 'not_recorded', 'skipped'] as const;
export type CyclePattern = (typeof CYCLE_PATTERNS)[number];

export const DIAGNOSIS_ANSWERS = ['yes', 'no', 'not_sure', 'prefer_not_to_say', 'not_recorded', 'skipped'] as const;
export type DiagnosisAnswer = (typeof DIAGNOSIS_ANSWERS)[number];

export const CONTRACEPTION_CONTEXTS = [
  'hormonal_related_bleeding',
  'recent_change',
  'other',
  'prefer_not_to_say',
  'not_recorded',
  'skipped',
] as const;
export type ContraceptionContext = (typeof CONTRACEPTION_CONTEXTS)[number];

export const LIFE_STAGE_CONTEXTS = [
  'postpartum',
  'pregnancy',
  'menopause_transition',
  'other_unsure',
  'prefer_not_to_say',
  'not_recorded',
  'skipped',
] as const;
export type LifeStageContext = (typeof LIFE_STAGE_CONTEXTS)[number];

export const LANGUAGES = ['en', 'fil', 'mixed', 'not_set'] as const;
export type LanguagePreference = (typeof LANGUAGES)[number];

export const TONES = ['gentle_concise', 'plain_detailed', 'not_set'] as const;
export type TonePreference = (typeof TONES)[number];

export const CHAT_RETENTIONS = ['off', '7_days', '30_days', 'manual', 'not_set'] as const;
export type ChatRetention = (typeof CHAT_RETENTIONS)[number];

/** Observed period start from setup. Unknown dates stay unknown — no assumed duration. */
export type PeriodAnswer =
  | { kind: 'known'; start: CalendarDate; end: CalendarDate | null; ongoing: boolean }
  | { kind: 'dont_remember' }
  | { kind: 'not_recorded' }
  | { kind: 'skipped' };

export type SetupAnswers = {
  cyclePattern: CyclePattern;
  diagnosis: DiagnosisAnswer;
  /** Free-text concern. Stored as a note, never interpreted as a diagnosis. */
  concernNote: string | null;
  contraception: ContraceptionContext;
  lifeStage: LifeStageContext;
  period: PeriodAnswer;
  language: LanguagePreference;
  tone: TonePreference;
  chatRetention: ChatRetention;
};

/** What is persisted on the device after the person chooses Save. */
export type LocalProfile = SetupAnswers & {
  schemaVersion: 1;
  /** ISO timestamp of the Save action. */
  savedAt: string;
};
