import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { ActionStack, Button } from '../../src/components/Button';
import { ChoiceCard, ChoiceGroup } from '../../src/components/ChoiceCard';
import { InlineError } from '../../src/components/FormField';
import { InfoCard } from '../../src/components/InfoCard';
import { Screen } from '../../src/components/Screen';
import { StepHeader } from '../../src/components/StepHeader';
import { useOnboardingDraft } from '../../src/state/OnboardingDraftContext';
import { textStyles } from '../../src/theme/typography';
import type { CyclePattern } from '../../src/types/profile';

const OPTIONS: { value: CyclePattern; label: string; description: string }[] = [
  { value: 'regular', label: 'Regular', description: 'The timing usually feels predictable to me.' },
  { value: 'irregular', label: 'Irregular', description: 'The timing varies or feels hard to predict.' },
  { value: 'unsure', label: "I'm not sure", description: "I haven't tracked enough to describe it yet." },
];

/** Step 1 of 4 — PDF p. 8 "How would you describe your cycles?" */
export default function CycleStepScreen() {
  const router = useRouter();
  const { draft, dispatch } = useOnboardingDraft();
  const [error, setError] = useState<string | null>(null);

  const select = (value: CyclePattern) => {
    dispatch({ type: 'update', changes: { cyclePattern: value } });
    setError(null);
  };

  const onContinue = () => {
    const answered = OPTIONS.some((option) => option.value === draft.cyclePattern);
    if (!answered) {
      setError('Choose the description that feels closest, or tap Skip.');
      return;
    }
    router.push('/onboarding/context');
  };

  const onSkip = () => {
    dispatch({ type: 'update', changes: { cyclePattern: 'skipped' } });
    setError(null);
    router.push('/onboarding/context');
  };

  return (
    <Screen>
      <StepHeader title="How would you describe your cycles?" step={1} onBack={() => router.back()} />

      <Text style={textStyles.bodySecondary}>
        Choose the description that feels closest to your experience. This is self-report, not a diagnosis.
      </Text>

      <ChoiceGroup label="Cycle description">
        {OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            label={option.label}
            description={option.description}
            selected={draft.cyclePattern === option.value}
            onPress={() => select(option.value)}
          />
        ))}
      </ChoiceGroup>
      <InlineError message={error} />

      <InfoCard
        title="There is no right answer"
        body="You can log periods and symptoms with any choice. Irregular does not mean you have a condition."
      />

      <ActionStack>
        <Button label="Continue to optional context" onPress={onContinue} />
        <Button label="Skip" variant="secondary" onPress={onSkip} />
      </ActionStack>
    </Screen>
  );
}
