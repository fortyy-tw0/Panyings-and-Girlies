import { createContext, useContext, useMemo, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';

import type { LocalProfile, SetupAnswers } from '../types/profile';

/**
 * Setup draft. Lives only in memory until the person chooses Save on step 4.
 * Going Back keeps these choices; nothing here is written to the device.
 */
export type OnboardingDraft = SetupAnswers;

export const initialDraft: OnboardingDraft = {
  cyclePattern: 'not_recorded',
  diagnosis: 'not_recorded',
  concernNote: null,
  contraception: 'not_recorded',
  lifeStage: 'not_recorded',
  period: { kind: 'not_recorded' },
  language: 'not_set',
  tone: 'not_set',
  chatRetention: 'not_set',
};

type DraftAction =
  | { type: 'update'; changes: Partial<OnboardingDraft> }
  | { type: 'skipContext' }
  | { type: 'skipPreferences' }
  | { type: 'reset' };

function draftReducer(state: OnboardingDraft, action: DraftAction): OnboardingDraft {
  switch (action.type) {
    case 'update':
      return { ...state, ...action.changes };
    case 'skipContext':
      return {
        ...state,
        diagnosis: 'skipped',
        concernNote: null,
        contraception: 'skipped',
        lifeStage: 'skipped',
      };
    case 'skipPreferences':
      return { ...state, language: 'not_set', tone: 'not_set', chatRetention: 'not_set' };
    case 'reset':
      return initialDraft;
  }
}

/** Converts the draft into the record that gets persisted. */
export const draftToProfile = (draft: OnboardingDraft, savedAt: Date = new Date()): LocalProfile => {
  const note = draft.concernNote?.trim();
  return {
    ...draft,
    concernNote: note ? note : null,
    schemaVersion: 1,
    savedAt: savedAt.toISOString(),
  };
};

type DraftContextValue = { draft: OnboardingDraft; dispatch: Dispatch<DraftAction> };

const DraftContext = createContext<DraftContextValue | null>(null);

export function OnboardingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const value = useMemo(() => ({ draft, dispatch }), [draft]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useOnboardingDraft(): DraftContextValue {
  const context = useContext(DraftContext);
  if (!context) throw new Error('useOnboardingDraft must be used inside OnboardingDraftProvider');
  return context;
}
