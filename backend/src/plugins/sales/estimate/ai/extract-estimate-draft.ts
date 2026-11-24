import {
  type AttachmentRef,
  type DocumentStorage,
  type SkippedDocument,
  readDocuments,
} from './document-reader';
import {
  type CatalogItem,
  type PrefillTemplate,
  buildPrefillPrompt,
} from './prefill-prompt.builder';
import {
  type EstimateDraft,
  PREFILL_TOOL_SCHEMA,
  SUBMIT_ESTIMATE_TOOL,
  normalizeDraft,
} from './prefill-schema';

import type { AiClient } from './ai-client.port';

export interface ExtractEstimateDraftInput {
  requirements: string;
  attachments: AttachmentRef[];
  template?: PrefillTemplate | null;
  catalog: CatalogItem[];
  storage: DocumentStorage;
}

/**
 * Documents + requirements + template + catalog in, a bounded, money-free draft out.
 * Throws a typed `AiError`; nothing here touches the database.
 */
export async function extractEstimateDraft(
  input: ExtractEstimateDraftInput,
  client: AiClient,
): Promise<{ draft: EstimateDraft; skipped: SkippedDocument[] }> {
  const { documents, skipped } = await readDocuments(
    input.attachments,
    input.storage,
  );
  const prompt = buildPrefillPrompt({
    requirements: input.requirements,
    documents,
    skipped,
    template: input.template,
    catalog: input.catalog,
  });
  const raw = await client.extract({
    ...prompt,
    toolName: SUBMIT_ESTIMATE_TOOL,
    toolSchema: PREFILL_TOOL_SCHEMA,
  });
  const draft = normalizeDraft(raw, new Set(input.catalog.map((c) => c.id)));
  return { draft, skipped };
}
