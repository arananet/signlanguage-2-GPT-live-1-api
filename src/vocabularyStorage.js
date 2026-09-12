import { z } from 'zod';
import { EXAMPLES_REQUIRED, MAX_PHRASES, SAMPLE_COUNT } from './personalSigns.js';

export const VOCABULARY_KEY = 'signflow.personal-vocabulary';

const phraseSchema = z.object({
  text: z.string().trim().min(1).max(120),
  examples: z.array(z.array(z.array(z.number().finite()).length(134)).length(SAMPLE_COUNT)).min(1).max(EXAMPLES_REQUIRED),
}).strict();
const vocabularySchema = z.object({
  version: z.literal(1),
  features: z.literal('hand-slots-134-v1'),
  phrases: z.array(phraseSchema).max(MAX_PHRASES).refine(phrases => new Set(phrases.map(phrase => phrase.text)).size === phrases.length),
}).strict();

export function loadVocabulary(storage = undefined) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(VOCABULARY_KEY);
    if (!raw) return { phrases: [], error: '' };
    if (raw.length > 2_000_000) throw new Error('Oversized vocabulary');
    const parsed = vocabularySchema.parse(JSON.parse(raw));
    return { phrases: parsed.phrases, error: '' };
  } catch {
    return { phrases: [], error: 'Saved vocabulary could not be loaded. Browser storage may be unavailable or the saved format incompatible.' };
  }
}

export function saveVocabulary(phrases, storage = undefined) {
  try {
    const parsed = vocabularySchema.parse({ version: 1, features: 'hand-slots-134-v1', phrases });
    const target = storage ?? globalThis.localStorage;
    if (phrases.length) target.setItem(VOCABULARY_KEY, JSON.stringify(parsed));
    else target.removeItem(VOCABULARY_KEY);
    return '';
  } catch {
    return 'Vocabulary changes could not be saved. Keep this page open; changes, including deletions, may be lost on reload.';
  }
}
