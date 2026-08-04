import { type DocumentType, isRecord } from './types.js';

export interface DetectionResult {
  type: DocumentType;
  /** Short explanation, surfaced by `--verbose` and by "unknown document" errors. */
  reason: string;
}

/**
 * Infers the document type from its contents rather than its filename, so a
 * bundle named `policies.json` is still recognised as a bundle.
 */
export const detectDocumentType = (document: unknown): DetectionResult => {
  if (!isRecord(document)) {
    return { type: 'unknown', reason: 'The document is not a JSON object.' };
  }

  if (Array.isArray(document.drafts)) {
    return { type: 'draft', reason: 'The document contains a "drafts" array.' };
  }

  const hasScope = typeof document.orgId === 'string'
    && typeof document.projectId === 'string'
    && typeof document.env === 'string';

  if (hasScope && Array.isArray(document.policies)) {
    return { type: 'bundle', reason: 'The document declares orgId, projectId, env and policies.' };
  }

  if (document.signature !== undefined || document.checksum !== undefined) {
    return { type: 'bundle', reason: 'The document carries bundle integrity metadata.' };
  }

  if (Array.isArray(document.policies)) {
    return {
      type: 'draft',
      reason: 'The document contains a "policies" array without runtime bundle scope fields.',
    };
  }

  return {
    type: 'unknown',
    reason: 'The document contains neither a "policies" array nor a "drafts" array.',
  };
};
