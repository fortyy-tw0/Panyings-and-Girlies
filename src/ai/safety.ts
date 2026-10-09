// Crisis-language check that runs BEFORE the model. Works fully offline.
// Keep the keyword list broad; false positives are better than misses here.

const CRISIS_PATTERNS = [
  /\bkill (my|him|her)self\b/i,
  /\bsuicid/i,
  /\bwant to die\b/i,
  /\bend (it all|my life)\b/i,
  /\bself[- ]?harm/i,
  /\bhurt(ing)? myself\b/i,
  /\bno reason to live\b/i,
  // Add Filipino/Tagalog phrases your users might use, reviewed by a native speaker.
];

export function detectCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some(p => p.test(text));
}

// TODO: VERIFY every number with the official source before launch, and re-check regularly.
export const CRISIS_RESOURCES = [
  { country: 'Philippines', name: 'NCMH Crisis Hotline', contact: '1553' },
  // Add other countries your users are in.
];

export const CRISIS_MESSAGE =
  "It sounds like you're going through something really heavy, and I'm glad you said it. " +
  "You deserve support from a real person right now. Please consider reaching out to someone you trust, " +
  'or one of these free, confidential lines:';
