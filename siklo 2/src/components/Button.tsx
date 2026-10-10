import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors, MIN_TOUCH, radius, spacing } from '../theme/tokens';
import { textStyles } from '../theme/typography';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shows a spinner, keeps the label, and blocks repeat presses. */
  loading?: boolean;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        pressed && !inactive && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator color={isPrimary ? colors.onPrimary : colors.primary} />}
        <Text
          style={[
            textStyles.button,
            styles.label,
            { color: isPrimary ? colors.onPrimary : colors.text },
            disabled && styles.disabledLabel,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Vertical stack of primary/secondary actions at the end of a screen. */
export function ActionStack({ children }: { children: ReactNode }) {
  return <View style={styles.stack}>{children}</View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md, marginTop: spacing.sm },
  base: {
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  disabled: { backgroundColor: colors.disabledBackground, borderColor: colors.border },
  disabledLabel: { color: colors.textSecondary },
  pressed: { opacity: 0.85 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { textAlign: 'center', flexShrink: 1 },
});
