import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionStack, Button } from '../../src/components/Button';
import { ChoiceCard, ChoiceGroup } from '../../src/components/ChoiceCard';
import { FieldLabel, HelperText, TextField } from '../../src/components/FormField';
import { Chip, InfoCard } from '../../src/components/InfoCard';
import { Screen } from '../../src/components/Screen';
import { StepHeader } from '../../src/components/StepHeader';
import { CONCERN_NOTE_MAX_LENGTH } from '../../src/config';
import { useOnboardingDraft } from '../../src/state/OnboardingDraftContext';
import { spacing } from '../../src/theme/tokens';
import { textStyles } from '../../src/theme/typography';
import type { ContraceptionContext, DiagnosisAnswer, LifeStageContext } from '../../src/types/profile';

type Option<T> = { value: T; label: string };

const DIAGNOSIS_OPTIONS: Option<DiagnosisAnswer>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

// Option labels from the contraception / life-stage specimens (PDF p. 83).
const CONTRACEPTION_OPTIONS: Option<ContraceptionContext>[] = [
  { value: 'hormonal_related_bleeding', label: 'Hormonal contraception / related bleeding' },
  { value: 'recent_change', label: 'Recent contraception change' },
  { value: 'other', label: 'Other context' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const LIFE_STAGE_OPTIONS: Option<LifeStageContext>[] = [
  { value: 'postpartum', label: 'Postpartum recovery' },
  { value: 'pregnancy', label: 'Pregnancy' },
  { value: 'menopause_transition', label: 'Menopause / transition context' },
  { value: 'other_unsure', label: "Other / I'm not sure" },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const ESTIMATE_UNSUITABLE: Partial<Record<LifeStageContext, string>> = {
  postpartum:
    "Postpartum recovery makes the ordinary date-based method unsuitable. You can still log bleeding and symptoms; postpartum bleeding won't be treated as a period forecast.",
  pregnancy:
    'Pregnancy makes the ordinary date-based method unsuitable. You can still log bleeding and symptoms.',
};

/** Step 2 of 4 — PDF p. 9 "Your context, your choice." Everything here is optional. */
export default function ContextStepScreen() {
  const router = useRouter();
  const { draft, dispatch } = useOnboardingDraft();

  const toggleDiagnosis = (value: DiagnosisAnswer) =>
    dispatch({ type: 'update', changes: { diagnosis: draft.diagnosis === value ? 'not_recorded' : value } });

  const chipLabel = draft.cyclePattern === 'irregular' ? 'Optional · irregular branch' : 'Optional';
  const estimateNote = ESTIMATE_UNSUITABLE[draft.lifeStage];

  return (
    <Screen>
      <StepHeader title="Your context, your choice." step={2} onBack={() => router.back()} />

      <Chip label={chipLabel} />

      <View style={styles.block}>
        <Text style={textStyles.question} accessibilityRole="header">
          Has a health professional diagnosed a condition that may affect your cycle?
        </Text>
        <Text style={textStyles.bodySecondary}>You never need to provide a diagnosis to continue.</Text>
      </View>

      <ChoiceGroup label="Diagnosed condition">
        {DIAGNOSIS_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            label={option.label}
            selected={draft.diagnosis === option.value}
            onPress={() => toggleDiagnosis(option.value)}
          />
        ))}
      </ChoiceGroup>

      <View style={styles.block}>
        <FieldLabel>Concern, not diagnosis · optional</FieldLabel>
        <TextField
          label="Concern, not diagnosis, optional"
          placeholder="Write a concern in your own words"
          value={draft.concernNote ?? ''}
          onChangeText={(text) => dispatch({ type: 'update', changes: { concernNote: text } })}
          maxLength={CONCERN_NOTE_MAX_LENGTH}
          multiline
          autoCorrect
        />
        <HelperText>
          {`A concern stays a note. It is never turned into a diagnosis. ${(draft.concernNote ?? '').length}/${CONCERN_NOTE_MAX_LENGTH}`}
        </HelperText>
      </View>

      <InfoCard
        tone="plain"
        title="Other context · optional"
        body="Contraception or life stage may change bleeding. You can add context without sharing sexual history."
      >
        <ContextSection
          addLabel="Add contraception context"
          groupLabel="Contraception context"
          options={CONTRACEPTION_OPTIONS}
          value={draft.contraception}
          onChange={(value) => dispatch({ type: 'update', changes: { contraception: value } })}
          helper={
            draft.contraception === 'hormonal_related_bleeding'
              ? 'Hormone-related bleeding may mean an estimate is not shown. Logging stays available.'
              : undefined
          }
        />
        <ContextSection
          addLabel="Add life-stage context"
          groupLabel="Life-stage context"
          options={LIFE_STAGE_OPTIONS}
          value={draft.lifeStage}
          onChange={(value) => dispatch({ type: 'update', changes: { lifeStage: value } })}
        />
        {estimateNote ? (
          <InfoCard title="Estimate unavailable for this context" body={estimateNote} />
        ) : null}
      </InfoCard>

      <Text style={textStyles.meta}>Some contexts mean an estimate is unsuitable. Logging remains available.</Text>

      <ActionStack>
        <Button label="Continue to dates" onPress={() => router.push('/onboarding/dates')} />
        <Button
          label="Skip"
          variant="secondary"
          accessibilityHint="Leaves all questions on this step unknown"
          onPress={() => {
            dispatch({ type: 'skipContext' });
            router.push('/onboarding/dates');
          }}
        />
      </ActionStack>
    </Screen>
  );
}

type ContextSectionProps<T extends string> = {
  addLabel: string;
  groupLabel: string;
  options: Option<T>[];
  value: T | 'not_recorded' | 'skipped';
  onChange: (value: T | 'not_recorded') => void;
  helper?: string;
};

/**
 * "Add … context" toggle. When opened it shows the option list; closing it
 * resets the answer to Not recorded.
 */
function ContextSection<T extends string>({ addLabel, groupLabel, options, value, onChange, helper }: ContextSectionProps<T>) {
  const selected = options.find((option) => option.value === value);
  // Opens automatically when returning to this step with an answer already chosen.
  const [open, setOpen] = useState(selected !== undefined);

  return (
    <View style={styles.section}>
      <ChoiceCard
        role="checkbox"
        label={addLabel}
        selected={open}
        onPress={() => {
          if (open) onChange('not_recorded');
          setOpen(!open);
        }}
      />
      {open && (
        <View style={styles.nested}>
          <ChoiceGroup label={groupLabel}>
            {options.map((option) => (
              <ChoiceCard
                key={option.value}
                label={option.label}
                selected={value === option.value}
                onPress={() => onChange(value === option.value ? 'not_recorded' : option.value)}
              />
            ))}
          </ChoiceGroup>
          {helper ? <HelperText>{helper}</HelperText> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  section: { gap: spacing.md, marginTop: spacing.sm },
  nested: { gap: spacing.sm, paddingLeft: spacing.md },
});
