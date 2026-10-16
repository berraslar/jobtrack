import type { Config } from '../../config.js';
import { FakeProvider } from './fake.js';
import { GeminiProvider } from './gemini.js';
import type { CvTailorProvider } from './provider.js';

/** ADR-0010: AI_PROVIDER tanımsızsa özellik kapalıdır (null). */
export function createAiProvider(config: Config): CvTailorProvider | null {
  if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
    return new GeminiProvider({
      apiKey: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
      fallbackModels: config.GEMINI_FALLBACK_MODELS,
    });
  }
  if (config.AI_PROVIDER === 'fake' && config.NODE_ENV === 'test') return new FakeProvider();
  return null;
}

export type { CvTailorProvider, TailorInput } from './provider.js';
