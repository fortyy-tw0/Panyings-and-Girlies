import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from './Button';
import {
  addMonths,
  compareDates,
  formatDate,
  formatMonth,
  isSameDate,
  monthGrid,
  WEEKDAY_LABELS,
} from '../lib/calendarDate';
import type { CalendarDate } from '../lib/calendarDate';
import { colors, MIN_TOUCH, radius, spacing } from '../theme/tokens';
import { fonts, textStyles } from '../theme/typography';

type CalendarDateModalProps = {
  visible: boolean;
  title: string;
  value: CalendarDate | null;
  /** Earliest selectable date (inclusive), if any. */
  minDate?: CalendarDate | null;
  /** Latest selectable date (inclusive) — usually today. */
  maxDate: CalendarDate;
  /** Explains which days are unavailable and why. */
  constraintNote: string;
  onSelect: (date: CalendarDate) => void;
  onClose: () => void;
};

/**
 * Dependency-free month calendar. Days outside the allowed range are shown but
 * disabled, and `constraintNote` explains the rule. Android back closes it.
 */
export function CalendarDateModal({
  visible,
  title,
  value,
  minDate = null,
  maxDate,
  constraintNote,
  onSelect,
  onClose,
}: CalendarDateModalProps) {
  const initial = value ?? maxDate;
  const [view, setView] = useState({ year: initial.year, month: initial.month });
  const [wasVisible, setWasVisible] = useState(visible);

  // Each time the calendar opens, jump to the selected (or latest allowed) month.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setView({ year: initial.year, month: initial.month });
  }

  const isDisabled = (date: CalendarDate) =>
    compareDates(date, maxDate) > 0 || (minDate !== null && compareDates(date, minDate) < 0);

  const canGoNext = view.year * 12 + view.month < maxDate.year * 12 + maxDate.month;
  const canGoPrev = minDate === null || view.year * 12 + view.month > minDate.year * 12 + minDate.month;

  const cells = monthGrid(view.year, view.month);
  const weeks: (CalendarDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close calendar" />
        <SafeAreaView edges={['top', 'bottom']} style={styles.safe} pointerEvents="box-none">
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text style={textStyles.section} accessibilityRole="header">
              {title}
            </Text>
            <Text style={textStyles.meta}>{constraintNote}</Text>

            <View style={styles.monthRow}>
              <MonthArrow
                label="‹"
                accessibilityLabel="Previous month"
                disabled={!canGoPrev}
                onPress={() => setView((v) => addMonths(v.year, v.month, -1))}
              />
              <Text style={textStyles.label} accessibilityRole="header">
                {formatMonth(view.year, view.month)}
              </Text>
              <MonthArrow
                label="›"
                accessibilityLabel="Next month"
                disabled={!canGoNext}
                onPress={() => setView((v) => addMonths(v.year, v.month, 1))}
              />
            </View>

            <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {WEEKDAY_LABELS.map((label, index) => (
                <Text key={index} style={[textStyles.meta, styles.weekday]}>
                  {label}
                </Text>
              ))}
            </View>

            {weeks.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.week}>
                {week.map((date, dayIndex) => {
                  if (!date) return <View key={dayIndex} style={styles.dayCell} />;
                  const disabled = isDisabled(date);
                  const selected = value !== null && isSameDate(date, value);
                  return (
                    <Pressable
                      key={dayIndex}
                      onPress={() => onSelect(date)}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityLabel={formatDate(date)}
                      accessibilityState={{ selected, disabled }}
                      style={styles.dayCell}
                    >
                      <View style={[styles.dayInner, selected && styles.daySelected]}>
                        <Text
                          style={[
                            styles.dayText,
                            disabled && styles.dayTextDisabled,
                            selected && styles.dayTextSelected,
                          ]}
                        >
                          {date.day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Button label="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

type MonthArrowProps = {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
};

function MonthArrow({ label, accessibilityLabel, disabled, onPress }: MonthArrowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={styles.arrow}
    >
      <Text style={[styles.arrowText, disabled && styles.dayTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  safe: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontFamily: fonts.semiBold, fontSize: 26, color: colors.primary },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  dayCell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dayInner: { minWidth: 38, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.primary },
  dayText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  dayTextDisabled: { color: colors.border },
  dayTextSelected: { color: colors.onPrimary },
});
