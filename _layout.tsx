import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '../src/components/Button';
import { OnboardingDraftProvider } from '../src/state/OnboardingDraftContext';
import { ProfileProvider, useProfile } from '../src/state/ProfileContext';
import { colors, spacing } from '../src/theme/tokens';
import { textStyles } from '../src/theme/typography';

export default function RootLayout() {
  // Fonts are bundled with the app by @expo-google-fonts; no network request at runtime.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {fontsLoaded || fontError ? (
        <ProfileProvider>
          <OnboardingDraftProvider>
            <RootNavigator />
          </OnboardingDraftProvider>
        </ProfileProvider>
      ) : (
        <LoadingView />
      )}
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { state, reload } = useProfile();

  if (state.status === 'loading') return <LoadingView />;

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={textStyles.section} accessibilityRole="header">
          Setup couldn’t be opened
        </Text>
        <Text style={[textStyles.bodySecondary, styles.centerText]}>{state.message}</Text>
        <Button label="Try again" onPress={reload} />
      </View>
    );
  }

  const hasProfile = state.profile !== null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      {/* Setup flow: only reachable before a local profile is saved. */}
      <Stack.Protected guard={!hasProfile}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      {/* After Save. */}
      <Stack.Protected guard={hasProfile}>
        <Stack.Screen name="home" />
      </Stack.Protected>
    </Stack>
  );
}

function LoadingView() {
  return (
    <View style={styles.center} accessibilityLabel="Loading">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xxl,
    backgroundColor: colors.canvas,
  },
  centerText: { textAlign: 'center' },
});
