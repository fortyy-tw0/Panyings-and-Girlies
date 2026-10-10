import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { CheckIcon } from './icons';
import { colors, MIN_TOUCH, radius, spacing } from '../theme/tokens';
import { textStyles } from '../theme/typography';

type ChoiceCardProps = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** 'radio' for one-of-many groups, 'checkbox' for independent toggles. */
  role?: 'radio' | 'checkbox';
};

/**
 * Selectable row with a round check mark. The whole card is the touch target.
 * Selection is shown with a filled check + tint, never colour alone.
 */
export function ChoiceCard({ label, description, selected, onPress, role = 'radio' }: ChoiceCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.cardPressed]}
    >
      <View style={[styles.mark, selected && styles.markSelected]}>{selected && <CheckIcon />}</View>
      <View style={styles.text}>
        <Text style={textStyles.label}>{label}</Text>
        {description ? <Text style={[textStyles.meta, styles.description]}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

type ChoiceGroupProps = {
  label: string;
  children: ReactNode;
};

/** Groups radio cards so screen readers announce them as one set. */
export function ChoiceGroup({ label, children }: ChoiceGroupProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cardSelected: { backgroundColor: colors.checked, borderColor: colors.primary },
  cardPressed: { opacity: 0.85 },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { flex: 1 },
  description: { marginTop: 2 },
});
