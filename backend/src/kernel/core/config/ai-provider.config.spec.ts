import {
  DEFAULT_OPENAI_MODEL,
  resolveAiSettings,
} from '@kernel/core/config/ai-provider.config';
import { DEFAULT_ANTHROPIC_MODEL } from '@kernel/core/config/anthropic.config';

describe('resolveAiSettings', () => {
  it('defaults to anthropic with its key and model', () => {
    expect(resolveAiSettings({ ANTHROPIC_API_KEY: ' k-a ' })).toEqual({
      provider: 'anthropic',
      apiKey: 'k-a',
      model: DEFAULT_ANTHROPIC_MODEL,
    });
  });

  it('uses the openai key and model when AI_PROVIDER=openai', () => {
    expect(
      resolveAiSettings({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'k-o',
        ANTHROPIC_API_KEY: 'k-a',
      }),
    ).toEqual({
      provider: 'openai',
      apiKey: 'k-o',
      model: DEFAULT_OPENAI_MODEL,
    });
    expect(DEFAULT_OPENAI_MODEL).toBe('gpt-5.6-luna');
    expect(
      resolveAiSettings({
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'k-o',
        OPENAI_MODEL: 'other',
      }).model,
    ).toBe('other');
  });

  it('is not configured when the chosen provider has no key', () => {
    expect(
      resolveAiSettings({ AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'k-a' })
        .apiKey,
    ).toBeUndefined();
    expect(
      resolveAiSettings({ OPENAI_API_KEY: 'k-o', ANTHROPIC_API_KEY: '  ' })
        .apiKey,
    ).toBeUndefined();
  });

  it('treats an unknown provider as not configured instead of guessing a key', () => {
    const settings = resolveAiSettings({
      AI_PROVIDER: 'gemini',
      ANTHROPIC_API_KEY: 'k-a',
      OPENAI_API_KEY: 'k-o',
    });
    expect(settings.apiKey).toBeUndefined();
  });
});
