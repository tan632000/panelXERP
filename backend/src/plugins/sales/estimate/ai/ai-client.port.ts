export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; mediaType: string; data: string }
  | { type: 'image'; mediaType: string; data: string };

export interface AiExtractRequest {
  system: string;
  content: AiContentBlock[];
  /** Name of the tool the model is forced to call, and the JSON Schema of its input. */
  toolName: string;
  toolSchema: Record<string, unknown>;
}

/** Returns the raw tool input the model produced; the caller validates it. */
export interface AiClient {
  extract(request: AiExtractRequest): Promise<unknown>;
}
