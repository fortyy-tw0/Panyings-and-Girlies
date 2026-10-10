import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, MIN_TOUCH, radius, spacing } from '../theme/tokens';
import { fonts, textStyles } from '../theme/typography';

export function FieldLabel({ children }: { children: string }) {
  return <Text style={textStyles.metaStrong}>{children}</Text>;
}

export function HelperText({ children }: { children: string }) {
  return <Text style={textStyles.meta}>{children}</Text>;
}

/** Error shown next to the field it belongs to, and announced to screen readers. */
export function InlineError({ message }: { message?: string | null }) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (!message) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {message}
    </Text>
  );
}

type SelectFieldProps = {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
  hasError?: boolean;
  accessibilityHint?: string;
};

/** Field-shaped button that opens a picker (e.g. the calendar). */
export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  disabled = false,
  hasError = false,
  accessibilityHint,
}: SelectFieldProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.field,
        hasError && styles.fieldError,
        disabled && styles.fieldDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.value, !value && styles.placeholder]}>{value ?? placeholder}</Text>
    </Pressable>
  );
}

type TextFieldProps = Omit<TextInputProps, 'style'> & { label: string };

export function TextField({ label, ...inputProps }: TextFieldProps) {
  return (
    <TextInput
      {...inputProps}
      accessibilityLabel={label}
      placeholderTextColor={colors.textSecondary}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: MIN_TOUCH + 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  fieldError: { borderColor: colors.error, borderWidth: 2 },
  fieldDisabled: { backgroundColor: colors.disabledBackground },
  pressed: { opacity: 0.85 },
  value: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.text },
  placeholder: { color: colors.textSecondary },
  input: {
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.error },
});
