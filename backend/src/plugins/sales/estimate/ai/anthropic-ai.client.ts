import { Logger } from '@nestjs/common';

import {
  AiInternalError,
  AiNotConfiguredError,
  AiOutputInvalidError,
  AiRateLimitedError,
  AiTimeoutError,
} from './ai-errors';

import type {
  AiClient,
  AiContentBlock,
  AiExtractRequest,
} from './ai-client.port';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
// [UNVERIFIED] request shape follows the documented Messages API; no live call has been made.
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 16_000;
const TIMEOUT_MS = 120_000;

export interface AnthropicSettings {
  apiKey?: string;
  model: string;
}

function toWireBlock(block: AiContentBlock): Record<string, unknown> {
  if (block.type === 'text') return block;
  return {
    type: block.type,
    source: { type: 'base64', media_type: block.mediaType, data: block.data },
  };
}

const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * Anthropic Messages API over `fetch`. Every failure becomes a typed error and the only thing
 * logged is the HTTP status: the upstream body, headers and error text can carry the key or
 * customer content.
 */
export class AnthropicAiClient implements AiClient {
  constructor(
    private readonly settings: AnthropicSettings,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly logger: Pick<Logger, 'warn'> = new Logger(
      AnthropicAiClient.name,
    ),
  ) {}

  async extract(request: AiExtractRequest): Promise<unknown> {
    if (!this.settings.apiKey) throw new AiNotConfiguredError();

    let response: Response;
    try {
      response = await this.fetchFn(MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.settings.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.settings.model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          tools: [
            {
              name: request.toolName,
              description: 'Nộp bản nháp dự toán đã trích xuất.',
              input_schema: request.toolSchema,
            },
          ],
          tool_choice: { type: 'tool', name: request.toolName },
          messages: [
            { role: 'user', content: request.content.map(toWireBlock) },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (isTimeout(error)) throw new AiTimeoutError();
      this.logger.warn('Anthropic request failed status=none');
      throw new AiInternalError();
    }

    if (!response.ok) {
      this.logger.warn(`Anthropic request failed status=${response.status}`);
      throw response.status === 429
        ? new AiRateLimitedError()
        : new AiInternalError();
    }

    const body = (await response.json().catch(() => null)) as {
      content?: Array<{ type?: string; name?: string; input?: unknown }>;
    } | null;
    const toolUse = body?.content?.find(
      (block) => block.type === 'tool_use' && block.name === request.toolName,
    );
    if (!toolUse) throw new AiOutputInvalidError();
    return toolUse.input;
  }
}
