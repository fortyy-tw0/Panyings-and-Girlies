// TEST STUB: fixed sample data until the real prediction engine is built.
import { CycleSummary } from './ai/prompts';

export async function getCycleSummary(): Promise<CycleSummary> {
  return {
    cycleDay: 2,
    phase: 'menstrual',
    avgCycleLength: 30,
    nextPeriodEstimate: 'Nov 7 (± 3 days)',
    recentSymptoms: ['cramps', 'tiredness'],
  };
}
