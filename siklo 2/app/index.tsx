import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../src/components/Button';
import { CycleWaveIllustration } from '../src/components/icons';
import { InfoCard } from '../src/components/InfoCard';
import { Screen } from '../src/components/Screen';
import { colors, radius, spacing } from '../src/theme/tokens';
import { textStyles } from '../src/theme/typography';

/** Welcome — PDF p. 7 "A little space for you." */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Text style={textStyles.heading} accessibilityRole="header">
        A little space for you.
      </Text>
      <Text style={textStyles.bodySecondary}>
        Track what you notice. Find clear information. Have room to talk — without creating an online account.
      </Text>

      <View style={styles.illustration}>
        <CycleWaveIllustration />
      </View>

      <InfoCard
        tone="plain"
        title="A local profile, not an account"
        body="No email, phone number or login. No date of birth required. This initial design is for adults."
      >
        <Text style={[textStyles.meta, styles.note]}>
          Your setup is stored on this device only after you choose Save. On-device AI is not included in this
          version of the app.
        </Text>
      </InfoCard>

      <Button label="Start privately" onPress={() => router.push('/onboarding/cycle')} />

      <Text style={textStyles.meta}>
        Four short steps. Optional questions can be skipped. Changes persist only when you choose Save.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  illustration: {
    backgroundColor: colors.emphasis,
    borderRadius: radius.card,
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { marginTop: spacing.xs },
});
