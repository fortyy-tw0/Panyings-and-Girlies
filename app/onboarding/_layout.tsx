import { Stack } from 'expo-router';

import { colors } from '../../src/theme/tokens';

/** The four setup steps. The draft itself lives in OnboardingDraftProvider (root layout). */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
