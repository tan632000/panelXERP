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

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
// Headroom for reasoning tokens on top of the structured output.
const MAX_OUTPUT_TOKENS = 32_000;
const TIMEOUT_MS = 120_000;

export interface OpenAiSettings {
  apiKey?: string;
  model: string;
}

function toWirePart(block: AiContentBlock): Record<string, unknown> {
  const dataUrl = (b: { mediaType: string; data: string }) =>
    `data:${b.mediaType};base64,${b.data}`;
  switch (block.type) {
    case 'text':
      return { type: 'input_text', text: block.text };
    case 'image':
      return { type: 'input_image', image_url: dataUrl(block) };
    case 'document':
      return {
        type: 'input_file',
        filename: 'document.pdf',
        file_data: dataUrl(block),
      };
  }
}

const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * OpenAI Responses API over `fetch`. Every failure becomes a typed error and the only thing
 * logged is the HTTP status: the upstream body, headers and error text can carry the key or
 * customer content.
 */
export class OpenAiAiClient implements AiClient {
  constructor(
    private readonly settings: OpenAiSettings,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly logger: Pick<Logger, 'warn'> = new Logger(
      OpenAiAiClient.name,
    ),
  ) {}

  async extract(request: AiExtractRequest): Promise<unknown> {
    if (!this.settings.apiKey) throw new AiNotConfiguredError();

    let response: Response;
    try {
      response = await this.fetchFn(RESPONSES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          model: this.settings.model,
          instructions: request.system,
          input: [{ role: 'user', content: request.content.map(toWirePart) }],
          tools: [
            {
              type: 'function',
              name: request.toolName,
              description: 'Nộp bản nháp dự toán đã trích xuất.',
              parameters: request.toolSchema,
              // The schema is not shaped for strict mode (optional fields, no closed objects).
              strict: false,
            },
          ],
          tool_choice: { type: 'function', name: request.toolName },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          // Customer documents must not be retained by the provider.
          store: false,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (isTimeout(error)) throw new AiTimeoutError();
      this.logger.warn('OpenAI request failed status=none');
      throw new AiInternalError();
    }

    if (!response.ok) {
      this.logger.warn(`OpenAI request failed status=${response.status}`);
      throw response.status === 429
        ? new AiRateLimitedError()
        : new AiInternalError();
    }

    const body = (await response.json().catch(() => null)) as {
      output?: Array<{ type?: string; name?: string; arguments?: string }>;
    } | null;
    const call = body?.output?.find(
      (item) => item.type === 'function_call' && item.name === request.toolName,
    );
    if (!call || typeof call.arguments !== 'string') {
      throw new AiOutputInvalidError();
    }
    try {
      return JSON.parse(call.arguments) as unknown;
    } catch {
      throw new AiOutputInvalidError();
    }
  }
}
