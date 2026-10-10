import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../src/components/Button';
import { InlineError } from '../src/components/FormField';
import { InfoCard } from '../src/components/InfoCard';
import { Screen } from '../src/components/Screen';
import { formatDate } from '../src/lib/calendarDate';
import { useProfile } from '../src/state/ProfileContext';
import { spacing } from '../src/theme/tokens';
import { textStyles } from '../src/theme/typography';
import type { LocalProfile } from '../src/types/profile';

/**
 * Placeholder shown after Save. Today, Calendar, Insights, Companion and Learn
 * are outside this batch; this screen only confirms what was stored.
 */
export default function HomePlaceholderScreen() {
  const { state, remove } = useProfile();
  const [resetError, setResetError] = useState<string | null>(null);
  const profile = state.status === 'ready' ? state.profile : null;

  if (!profile) return null;

  const onDevReset = async () => {
    try {
      await remove();
    } catch {
      setResetError('The local profile could not be removed. Try again.');
    }
  };

  return (
    <Screen>
      <Text style={textStyles.heading} accessibilityRole="header">
        Saved on this device.
      </Text>
      <Text style={textStyles.bodySecondary}>
        Your setup was saved in this app on this phone. It is not an online account and is not a backup.
      </Text>

      <InfoCard tone="plain" title="Your setup">
        <View style={styles.rows}>
          {summaryRows(profile).map(([label, value]) => (
            <View key={label} style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
              <Text style={textStyles.metaStrong}>{label}</Text>
              <Text style={textStyles.body}>{value}</Text>
            </View>
          ))}
        </View>
      </InfoCard>

      <InfoCard
        title="More screens are on the way"
        body="Today, Calendar, Insights, Companion and Learn are not built in this version yet."
      />

      {__DEV__ ? (
        <View style={styles.dev}>
          <Text style={textStyles.meta}>Development only — not part of the design.</Text>
          <Button label="Delete local profile and restart setup" variant="secondary" onPress={() => void onDevReset()} />
          <InlineError message={resetError} />
        </View>
      ) : null}
    </Screen>
  );
}

const LABELS: Record<string, string> = {
  regular: 'Regular',
  irregular: 'Irregular',
  unsure: 'Not sure',
  yes: 'Yes',
  no: 'No',
  not_sure: 'Not sure',
  prefer_not_to_say: 'Prefer not to say',
  hormonal_related_bleeding: 'Hormonal contraception / related bleeding',
  recent_change: 'Recent contraception change',
  other: 'Other context',
  postpartum: 'Postpartum recovery',
  pregnancy: 'Pregnancy',
  menopause_transition: 'Menopause / transition',
  other_unsure: "Other / I'm not sure",
  en: 'English',
  fil: 'Filipino',
  mixed: 'English + Filipino / mixed',
  gentle_concise: 'Gentle and concise',
  plain_detailed: 'Plain and detailed',
  off: "Off — don't retain chat",
  '7_days': '7 days',
  '30_days': '30 days',
  manual: 'Manual — until I clear it',
  not_recorded: 'Not recorded',
  not_set: 'Not set',
  skipped: 'Skipped',
};

const label = (value: string): string => LABELS[value] ?? value;

function periodSummary(period: LocalProfile['period']): string {
  switch (period.kind) {
    case 'known': {
      const end = period.ongoing ? 'still ongoing' : period.end ? `ended ${formatDate(period.end)}` : 'end not recorded';
      return `Started ${formatDate(period.start)} · ${end}`;
    }
    case 'dont_remember':
      return "Don't remember";
    case 'not_recorded':
      return 'Not recorded';
    case 'skipped':
      return 'Skipped';
  }
}

function summaryRows(profile: LocalProfile): [string, string][] {
  return [
    ['Cycle description', label(profile.cyclePattern)],
    ['Diagnosed condition', label(profile.diagnosis)],
    ['Concern note', profile.concernNote ? 'Added' : 'None'],
    ['Contraception context', label(profile.contraception)],
    ['Life-stage context', label(profile.lifeStage)],
    ['Period start', periodSummary(profile.period)],
    ['Language', label(profile.language)],
    ['Tone', label(profile.tone)],
    ['Saved chat retention', label(profile.chatRetention)],
  ];
}

const styles = StyleSheet.create({
  rows: { gap: spacing.md, marginTop: spacing.sm },
  row: { gap: 2 },
  dev: { gap: spacing.sm, marginTop: spacing.lg },
});
