import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TOTAL_SETUP_STEPS } from '../config';
import { colors, MIN_TOUCH, radius, spacing } from '../theme/tokens';
import { textStyles } from '../theme/typography';

type StepHeaderProps = {
  title: string;
  step: number;
  onBack: () => void;
};

/** Title, "‹ Back", "Step n of 4" and the segmented progress bar (PDF p. 8–11). */
export function StepHeader({ title, step, onBack }: StepHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={textStyles.heading} accessibilityRole="header">
        {title}
      </Text>

      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          style={styles.back}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityHint="Returns to the previous step. Your choices are kept."
        >
          <Text style={textStyles.link}>‹ Back</Text>
        </Pressable>
        <Text style={textStyles.link}>
          Step {step} of {TOTAL_SETUP_STEPS}
        </Text>
      </View>

      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Setup progress, step ${step} of ${TOTAL_SETUP_STEPS}`}
        accessibilityValue={{ min: 0, max: TOTAL_SETUP_STEPS, now: step }}
      >
        {Array.from({ length: TOTAL_SETUP_STEPS }, (_, index) => (
          <View key={index} style={[styles.segment, index < step && styles.segmentActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  back: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  segment: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  segmentActive: { backgroundColor: colors.primary },
});
