import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionStack, Button } from '../../src/components/Button';
import { CalendarDateModal } from '../../src/components/CalendarDateModal';
import { ChoiceCard } from '../../src/components/ChoiceCard';
import { FieldLabel, HelperText, InlineError, SelectField } from '../../src/components/FormField';
import { InfoCard } from '../../src/components/InfoCard';
import { Screen } from '../../src/components/Screen';
import { StepHeader } from '../../src/components/StepHeader';
import { formatDate, todayLocal } from '../../src/lib/calendarDate';
import type { CalendarDate } from '../../src/lib/calendarDate';
import { hasErrors, validatePeriod } from '../../src/lib/periodValidation';
import type { PeriodErrors } from '../../src/lib/periodValidation';
import { useOnboardingDraft } from '../../src/state/OnboardingDraftContext';
import { MIN_TOUCH, spacing } from '../../src/theme/tokens';
import { textStyles } from '../../src/theme/typography';
import type { PeriodAnswer } from '../../src/types/profile';

type OpenPicker = 'start' | 'end' | null;

/** Step 3 of 4 — PDF p. 10 "Start with what you know." No dates are ever filled in for the person. */
export default function DatesStepScreen() {
  const router = useRouter();
  const { draft, dispatch } = useOnboardingDraft();
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [errors, setErrors] = useState<PeriodErrors>({});
  const [ongoingError, setOngoingError] = useState<string | null>(null);
  const today = useMemo(() => todayLocal(), []);

  const period = draft.period;
  const known = period.kind === 'known' ? period : null;

  const setPeriod = (next: PeriodAnswer) => {
    dispatch({ type: 'update', changes: { period: next } });
    setErrors({});
    setOngoingError(null);
  };

  const onPickStart = (start: CalendarDate) => {
    // Keep any end date the person already chose; if it no longer fits, validation explains why.
    setPeriod({ kind: 'known', start, end: known?.end ?? null, ongoing: known?.ongoing ?? false });
    setOpenPicker(null);
  };

  const onPickEnd = (end: CalendarDate) => {
    if (known) setPeriod({ ...known, end, ongoing: false });
    setOpenPicker(null);
  };

  const toggleOngoing = () => {
    if (!known) {
      setOngoingError('Choose a period start date first, then mark it as ongoing.');
      return;
    }
    setPeriod({ ...known, ongoing: !known.ongoing, end: known.ongoing ? known.end : null });
  };

  const toggleDontRemember = () => {
    setPeriod(period.kind === 'dont_remember' ? { kind: 'not_recorded' } : { kind: 'dont_remember' });
  };

  const onContinue = () => {
    const found = validatePeriod(period, today);
    setErrors(found);
    if (!hasErrors(found)) router.push('/onboarding/preferences');
  };

  const onSkip = () => {
    setPeriod({ kind: 'skipped' });
    router.push('/onboarding/preferences');
  };

  return (
    <Screen>
      <StepHeader title="Start with what you know." step={3} onBack={() => router.back()} />

      <Text style={textStyles.bodySecondary}>
        Add an observed period start, or leave dates unknown. We will not fill in missing periods.
      </Text>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <FieldLabel>Known period start · optional</FieldLabel>
          {known ? <ClearLink label="Clear start date" onPress={() => setPeriod({ kind: 'not_recorded' })} /> : null}
        </View>
        <SelectField
          label="Known period start"
          value={known ? formatDate(known.start) : null}
          placeholder="Choose an observed date"
          onPress={() => setOpenPicker('start')}
          hasError={Boolean(errors.start)}
          accessibilityHint="Opens a calendar"
        />
        <InlineError message={errors.start} />
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <FieldLabel>End date · optional</FieldLabel>
          {known?.end ? <ClearLink label="Clear end date" onPress={() => setPeriod({ ...known, end: null })} /> : null}
        </View>
        <SelectField
          label="End date"
          value={known?.end ? formatDate(known.end) : null}
          placeholder="Not recorded"
          onPress={() => setOpenPicker('end')}
          disabled={!known || known.ongoing}
          hasError={Boolean(errors.end)}
          accessibilityHint={
            !known ? 'Choose a start date first' : known.ongoing ? 'Unavailable while the period is ongoing' : 'Opens a calendar'
          }
        />
        <InlineError message={errors.end} />
        <HelperText>
          {!known
            ? 'Leave unknown dates blank. No assumed duration. Choose a start date to add an end date.'
            : 'Leave unknown dates blank. No assumed duration.'}
        </HelperText>
      </View>

      <ChoiceCard
        role="checkbox"
        label="Still ongoing"
        description="An ongoing period has no completed duration."
        selected={known?.ongoing ?? false}
        onPress={toggleOngoing}
      />
      <InlineError message={ongoingError} />

      <ChoiceCard
        role="checkbox"
        label="I don't remember"
        description="Continue without creating a date."
        selected={period.kind === 'dont_remember'}
        onPress={toggleDontRemember}
      />

      <InfoCard
        title="No history yet"
        body="Still learning. No period window will be shown with fewer than three complete start-to-start intervals."
      />

      <ActionStack>
        <Button label="Continue to preferences" onPress={onContinue} />
        <Button
          label="Skip"
          variant="secondary"
          accessibilityHint="Leaves period dates unknown"
          onPress={onSkip}
        />
      </ActionStack>

      <CalendarDateModal
        visible={openPicker === 'start'}
        title="Known period start"
        value={known?.start ?? null}
        maxDate={today}
        constraintNote="Choose a day you observed. Dates after today can't be chosen."
        onSelect={onPickStart}
        onClose={() => setOpenPicker(null)}
      />
      <CalendarDateModal
        visible={openPicker === 'end'}
        title="End date"
        value={known?.end ?? null}
        minDate={known?.start ?? null}
        maxDate={today}
        constraintNote="The end date can't be before the start date or after today."
        onSelect={onPickEnd}
        onClose={() => setOpenPicker(null)}
      />
    </Screen>
  );
}

function ClearLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={styles.clear}>
      <Text style={textStyles.link}>Clear</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  clear: { minHeight: MIN_TOUCH, justifyContent: 'center' },
});
