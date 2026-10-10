import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_BRAND } from '../config';
import { colors, radius, SCREEN_INSET, spacing } from '../theme/tokens';
import { textStyles } from '../theme/typography';

type ScreenProps = {
  children: ReactNode;
  /** Shows the "SikLO · Local profile" bar used across onboarding. */
  showHeader?: boolean;
};

/**
 * Shared screen shell: real safe-area insets, scrollable content (nothing is
 * clipped on small screens or with large text) and keyboard avoidance.
 */
export function Screen({ children, showHeader = true }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {showHeader && <AppHeader />}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AppHeader() {
  return (
    <View style={styles.header}>
      <Text style={textStyles.brand} accessibilityRole="header">
        {APP_BRAND}
      </Text>
      <View style={styles.pill}>
        <Text style={textStyles.metaStrong}>Local profile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_INSET,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.border,
  },
  pill: {
    backgroundColor: colors.emphasis,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  content: {
    paddingHorizontal: SCREEN_INSET,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
});
