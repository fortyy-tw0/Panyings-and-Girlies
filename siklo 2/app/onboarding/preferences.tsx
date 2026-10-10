import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionStack, Button } from '../../src/components/Button';
import { ChoiceCard, ChoiceGroup } from '../../src/components/ChoiceCard';
import { InlineError } from '../../src/components/FormField';
import { InfoCard } from '../../src/components/InfoCard';
import { Screen } from '../../src/components/Screen';
import { StepHeader } from '../../src/components/StepHeader';
import { draftToProfile, useOnboardingDraft } from '../../src/state/OnboardingDraftContext';
import type { OnboardingDraft } from '../../src/state/OnboardingDraftContext';
import { useProfile } from '../../src/state/ProfileContext';
import { spacing } from '../../src/theme/tokens';
import { textStyles } from '../../src/theme/typography';
import type { ChatRetention, LanguagePreference, TonePreference } from '../../src/types/profile';

type Option<T> = { value: T; label: string };

const LANGUAGE_OPTIONS: Option<LanguagePreference>[] = [
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Filipino' },
  { value: 'mixed', label: 'English + Filipino / mixed' },
];

const TONE_OPTIONS: Option<TonePreference>[] = [
  { value: 'gentle_concise', label: 'Gentle and concise' },
  { value: 'plain_detailed', label: 'Plain and detailed' },
];

const RETENTION_OPTIONS: Option<ChatRetention>[] = [
  { value: 'off', label: "Off — don't retain chat" },
  { value: '7_days', label: '7 days' },
  { value: '30_days', label: '30 days' },
  { value: 'manual', label: 'Manual — until I clear it' },
];

/** Step 4 of 4 — PDF p. 11 "Make this space yours." Save is the only action that persists setup. */
export default function PreferencesStepScreen() {
  const router = useRouter();
  const { draft, dispatch } = useOnboardingDraft();
  const { save } = useProfile();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const persist = async (answers: OnboardingDraft) => {
    if (inFlight.current) return; // blocks double taps before React re-renders
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await save(draftToProfile(answers));
      // The root navigator switches to the saved-profile screens automatically.
      dispatch({ type: 'reset' });
    } catch {
      setSaveError("Your changes weren't saved. Your input is still here. Try again.");
      inFlight.current = false;
      setSaving(false);
    }
  };

  const onSave = () => {
    void persist(draft);
  };

  const onSkipAndSave = () => {
    dispatch({ type: 'skipPreferences' });
    void persist({ ...draft, language: 'not_set', tone: 'not_set', chatRetention: 'not_set' });
  };

  return (
    <Screen>
      <StepHeader title="Make this space yours." step={4} onBack={() => router.back()} />

      <Text style={textStyles.bodySecondary}>
        These preferences are optional. Type in English, Filipino or a mix of both.
      </Text>

      <PreferenceGroup
        title="Language"
        options={LANGUAGE_OPTIONS}
        value={draft.language}
        onChange={(language) => dispatch({ type: 'update', changes: { language } })}
        unset="not_set"
      />
      <PreferenceGroup
        title="Tone"
        options={TONE_OPTIONS}
        value={draft.tone}
        onChange={(tone) => dispatch({ type: 'update', changes: { tone } })}
        unset="not_set"
      />
      <PreferenceGroup
        title="Saved chat retention"
        options={RETENTION_OPTIONS}
        value={draft.chatRetention}
        onChange={(chatRetention) => dispatch({ type: 'update', changes: { chatRetention } })}
        unset="not_set"
      />

      <InfoCard
        title="Ready when you are"
        body="Only Save persists your setup. Back keeps draft choices; Skip leaves optional fields unknown."
      />

      <InlineError message={saveError} />

      <ActionStack>
        <Button label={saving ? 'Saving…' : 'Save local profile'} onPress={onSave} loading={saving} />
        <Button
          label="Skip optional preferences & save"
          variant="secondary"
          onPress={onSkipAndSave}
          disabled={saving}
        />
      </ActionStack>
    </Screen>
  );
}

type PreferenceGroupProps<T extends string> = {
  title: string;
  options: Option<T>[];
  value: T;
  unset: T;
  onChange: (value: T) => void;
};

/** One optional single-choice preference. Tapping the selected option again clears it. */
function PreferenceGroup<T extends string>({ title, options, value, unset, onChange }: PreferenceGroupProps<T>) {
  return (
    <View style={styles.group}>
      <Text style={textStyles.section} accessibilityRole="header">
        {title}
      </Text>
      <ChoiceGroup label={title}>
        {options.map((option) => (
          <ChoiceCard
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onPress={() => onChange(value === option.value ? unset : option.value)}
          />
        ))}
      </ChoiceGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
});
