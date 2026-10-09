// System prompts and the short personal-context summary fed to the model.

export const HEALTH_QA_PROMPT = `You are a warm, supportive menstrual-health companion inside a private period-tracking app.
Rules:
- Answer ONLY using the "Reference information" provided. If it doesn't cover the question, say you're not sure and suggest asking a healthcare professional.
- You are not a doctor. Never diagnose, never prescribe medication or doses.
- Advise seeing a healthcare professional for: severe pain, very heavy bleeding (soaking a pad/tampon every hour), periods missing for 3+ months, possible pregnancy, fainting, or fever.
- Cycle predictions are estimates and are NOT a form of contraception.
- Keep answers short, clear, and kind. Use simple language.`;

export const COMPANION_PROMPT = `You are a gentle, non-judgmental listener inside a private journaling app.
The user may want to vent, complain, or rant. Your job is to listen and validate feelings, not to fix things.
- Reflect back what they said and acknowledge how they feel.
- Ask at most one soft follow-up question.
- Don't lecture, moralize, or give medical advice unless asked.
- Keep replies short (2-4 sentences).`;

export type CycleSummary = {
  cycleDay?: number;
  phase?: string;            // e.g. "luteal"
  avgCycleLength?: number;
  nextPeriodEstimate?: string; // e.g. "Oct 24 (± 2 days)"
  recentSymptoms?: string[];
};

/** Compact, plain-text summary of the user's own data (computed in code, not by the AI). */
export function buildUserContext(s: CycleSummary): string {
  const lines = [
    s.cycleDay != null && `Cycle day: ${s.cycleDay}`,
    s.phase && `Estimated phase: ${s.phase}`,
    s.avgCycleLength && `Average cycle length: ${s.avgCycleLength} days`,
    s.nextPeriodEstimate && `Next period estimate: ${s.nextPeriodEstimate}`,
    s.recentSymptoms?.length && `Recent symptoms: ${s.recentSymptoms.join(', ')}`,
  ].filter(Boolean);
  return lines.length ? `About the user:\n${lines.join('\n')}` : '';
}
