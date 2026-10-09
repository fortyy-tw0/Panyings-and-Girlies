// Ties everything together: safety check -> knowledge search -> prompt -> streamed answer.
import { DB } from '@op-engineering/op-sqlite';
import { loadModel } from './modelManager';
import { searchKnowledge } from './knowledge';
import { HEALTH_QA_PROMPT, COMPANION_PROMPT, buildUserContext, CycleSummary } from './prompts';
import { detectCrisis } from './safety';

export type Mode = 'health' | 'companion';
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type AskResult =
  | { type: 'crisis' }                 // UI shows CRISIS_MESSAGE + CRISIS_RESOURCES
  | { type: 'answer'; text: string };

export async function ask(opts: {
  db: DB;
  mode: Mode;
  question: string;
  history: ChatMessage[];          // earlier messages in this chat
  summary: CycleSummary;           // computed by your cycle logic
  onToken?: (token: string) => void; // for streaming text into the UI
}): Promise<AskResult> {
  const { db, mode, question, history, summary, onToken } = opts;

  // 1. Safety first, before the model sees anything.
  if (detectCrisis(question)) return { type: 'crisis' };

  // 2. Build the system prompt.
  let system = mode === 'health' ? HEALTH_QA_PROMPT : COMPANION_PROMPT;
  const userContext = buildUserContext(summary);
  if (userContext) system += `\n\n${userContext}`;

  if (mode === 'health') {
    const reference = await searchKnowledge(db, question);
    system += `\n\nReference information:\n${reference || '(none found)'}`;
  }

  // 3. Keep only recent history so we stay within the context window.
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];

  // 4. Generate.
  const ctx = await loadModel();
  const result = await ctx.completion(
    {
      messages,
      n_predict: 400,
      temperature: mode === 'health' ? 0.3 : 0.7,
      top_p: 0.9,
      jinja: true,             // use the model's own chat template
      enable_thinking: false,  // Qwen3.5 "thinking" off = faster replies. Check your llama.rn version supports this flag.
    } as any,
    data => onToken?.(data.token),
  );

  return { type: 'answer', text: result.text.trim() };
}

/** Lets the user tap "Stop" while the model is answering. */
export async function stopAnswer() {
  const ctx = await loadModel();
  await ctx.stopCompletion();
}
