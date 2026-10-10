import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius, spacing } from '../theme/tokens';
import { textStyles } from '../theme/typography';

type InfoCardProps = {
  title?: string;
  body?: string;
  /** 'emphasis' = cream/yellow note card, 'plain' = white outlined card. */
  tone?: 'emphasis' | 'plain';
  children?: ReactNode;
};

export function InfoCard({ title, body, tone = 'emphasis', children }: InfoCardProps) {
  return (
    <View style={[styles.card, tone === 'emphasis' ? styles.emphasis : styles.plain]}>
      {title ? (
        <Text style={textStyles.section} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {body ? <Text style={textStyles.bodySecondary}>{body}</Text> : null}
      {children}
    </View>
  );
}

type ChipProps = { label: string };

/** Small yellow tag, e.g. "Optional · irregular branch". */
export function Chip({ label }: ChipProps) {
  return (
    <View style={styles.chip}>
      <Text style={textStyles.metaStrong}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  emphasis: { backgroundColor: colors.emphasis },
  plain: { backgroundColor: colors.card },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.emphasis,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
});
