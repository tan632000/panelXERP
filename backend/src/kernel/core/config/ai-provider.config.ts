import { registerAs } from '@nestjs/config';

import { DEFAULT_ANTHROPIC_MODEL } from '@kernel/core/config/anthropic.config';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';

/** Provider-neutral AI settings; `apiKey` is the key of the chosen provider. */
export interface AiSettings {
  provider: string;
  apiKey?: string;
  model: string;
}

const clean = (value: string | undefined): string | undefined =>
  value?.trim() || undefined;

export function resolveAiSettings(env: NodeJS.ProcessEnv): AiSettings {
  const provider = clean(env.AI_PROVIDER)?.toLowerCase() ?? 'anthropic';
  // An unknown provider fails closed: no key, so the feature answers "not configured".
  if (provider === 'openai') {
    return {
      provider,
      apiKey: clean(env.OPENAI_API_KEY),
      model: clean(env.OPENAI_MODEL) ?? DEFAULT_OPENAI_MODEL,
    };
  }
  return {
    provider,
    apiKey: provider === 'anthropic' ? clean(env.ANTHROPIC_API_KEY) : undefined,
    model: clean(env.ANTHROPIC_MODEL) ?? DEFAULT_ANTHROPIC_MODEL,
  };
}

export default registerAs('ai', () => resolveAiSettings(process.env));
