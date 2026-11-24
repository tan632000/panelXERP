import { createAiClient } from '@plugins/sales/estimate/estimate.module';

import {
  AiInternalError,
  AiNotConfiguredError,
  AiOutputInvalidError,
  AiRateLimitedError,
  AiTimeoutError,
} from './ai-errors';
import { AnthropicAiClient } from './anthropic-ai.client';
import { OpenAiAiClient } from './openai-ai.client';

import type { AiExtractRequest } from './ai-client.port';

const KEY = 'sk-secret-key-123';
const BODY_SECRET = 'upstream-body-customer-secret';

const request: AiExtractRequest = {
  system: 'sys prompt',
  toolName: 'submit_draft',
  toolSchema: { type: 'object', properties: { a: { type: 'string' } } },
  content: [
    { type: 'text', text: 'hello' },
    { type: 'image', mediaType: 'image/png', data: 'IMGDATA' },
    { type: 'document', mediaType: 'application/pdf', data: 'PDFDATA' },
  ],
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

const callOutput = (name: string, args: string) => ({
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'function_call', name, arguments: args, call_id: 'c1' },
  ],
});

function build(fetchFn: jest.Mock, settings = { apiKey: KEY, model: 'm-1' }) {
  const logger = { warn: jest.fn() };
  return {
    client: new OpenAiAiClient(settings, fetchFn, logger),
    logger,
  };
}

describe('OpenAiAiClient', () => {
  it('posts the forced function call to the responses endpoint and parses its arguments', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, callOutput('submit_draft', '{"a":"x"}')),
      );
    const { client } = build(fetchFn);

    await expect(client.extract(request)).resolves.toEqual({ a: 'x' });

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${KEY}`,
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'm-1',
      instructions: 'sys prompt',
      store: false,
      tool_choice: { type: 'function', name: 'submit_draft' },
      tools: [
        {
          type: 'function',
          name: 'submit_draft',
          parameters: request.toolSchema,
          strict: false,
        },
      ],
    });
    expect(body.max_output_tokens).toEqual(expect.any(Number));
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('maps text, image and pdf blocks to input parts', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, callOutput('submit_draft', '{}')));
    await build(fetchFn).client.extract(request);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      input: Array<{ role: string; content: unknown[] }>;
    };
    expect(body.input).toHaveLength(1);
    expect(body.input[0].role).toBe('user');
    expect(body.input[0].content).toEqual([
      { type: 'input_text', text: 'hello' },
      { type: 'input_image', image_url: 'data:image/png;base64,IMGDATA' },
      {
        type: 'input_file',
        filename: 'document.pdf',
        file_data: 'data:application/pdf;base64,PDFDATA',
      },
    ]);
  });

  it('throws AiNotConfiguredError without a key and makes no call', async () => {
    const fetchFn = jest.fn();
    const { client } = build(fetchFn, {
      apiKey: undefined,
      model: 'm-1',
    } as never);
    await expect(client.extract(request)).rejects.toBeInstanceOf(
      AiNotConfiguredError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps 429 to AiRateLimitedError', async () => {
    const { client } = build(
      jest.fn().mockResolvedValue(jsonResponse(429, {})),
    );
    await expect(client.extract(request)).rejects.toBeInstanceOf(
      AiRateLimitedError,
    );
  });

  it.each([500, 503, 400])(
    'maps status %i to AiInternalError',
    async (status) => {
      const { client } = build(
        jest.fn().mockResolvedValue(jsonResponse(status, {})),
      );
      await expect(client.extract(request)).rejects.toBeInstanceOf(
        AiInternalError,
      );
    },
  );

  it('maps a timeout to AiTimeoutError and other network failures to AiInternalError', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    await expect(
      build(jest.fn().mockRejectedValue(timeout)).client.extract(request),
    ).rejects.toBeInstanceOf(AiTimeoutError);
    await expect(
      build(
        jest.fn().mockRejectedValue(new Error('ECONNRESET')),
      ).client.extract(request),
    ).rejects.toBeInstanceOf(AiInternalError);
  });

  it.each([
    ['no function call', { output: [{ type: 'message', content: [] }] }],
    ['another function', callOutput('other_fn', '{}')],
    ['non-JSON arguments', callOutput('submit_draft', 'not json')],
    ['non-JSON body', undefined],
  ])('throws AiOutputInvalidError for %s', async (_label, payload) => {
    const response =
      payload === undefined
        ? new Response('<html>', { status: 200 })
        : jsonResponse(200, payload);
    const { client } = build(jest.fn().mockResolvedValue(response));
    await expect(client.extract(request)).rejects.toBeInstanceOf(
      AiOutputInvalidError,
    );
  });

  it('logs only the status, never the key or the upstream body', async () => {
    const failing = build(
      jest.fn().mockResolvedValue(jsonResponse(500, { error: BODY_SECRET })),
    );
    await expect(failing.client.extract(request)).rejects.toBeInstanceOf(
      AiInternalError,
    );
    const network = build(
      jest.fn().mockRejectedValue(new Error(`${KEY} ${BODY_SECRET}`)),
    );
    await expect(network.client.extract(request)).rejects.toBeInstanceOf(
      AiInternalError,
    );

    const logged = JSON.stringify([
      failing.logger.warn.mock.calls,
      network.logger.warn.mock.calls,
    ]);
    expect(logged).toContain('500');
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(BODY_SECRET);
  });
});

describe('createAiClient', () => {
  it('returns the client of the chosen provider', () => {
    expect(
      createAiClient({ provider: 'openai', apiKey: KEY, model: 'm' }),
    ).toBeInstanceOf(OpenAiAiClient);
    expect(
      createAiClient({ provider: 'anthropic', apiKey: KEY, model: 'm' }),
    ).toBeInstanceOf(AnthropicAiClient);
  });

  it('never builds an openai client for an unknown provider', () => {
    expect(
      createAiClient({ provider: 'gemini', apiKey: undefined, model: 'm' }),
    ).not.toBeInstanceOf(OpenAiAiClient);
  });
});
