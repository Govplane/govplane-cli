import { type DocumentType, isRecord } from './types.js';

export interface DetectionResult {
  type: DocumentType;
  /** Short explanation, surfaced by `--verbose` and by "unknown document" errors. */
  reason: string;
}

/**
 * Infers the document type from its contents rather than its filename, so a
 * bundle named `policies.json` is still recognised as a bundle.
 *
 * Order matters. Scope fields and integrity metadata settle the question
 * outright, so they are read before the `policies` array, which both shapes
 * carry. Only when nothing conclusive is present does the array decide.
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
    // A bundle built locally carries no scope, and is unsigned until somebody
    // signs it — so neither test above reaches it, and it used to be read as a
    // draft and checked against the draft rules. Two fields still identify it.
    //
    // Both checks live inside this branch on purpose: they can only ever
    // reclassify a document that would otherwise be called a draft, so nothing
    // recognised as a bundle today can change.

    // A revision counter the control plane increments on every materialisation
    // and `govplane build` reproduces. No draft shape has ever carried one.
    if (typeof document.bundleVersion === 'number') {
      return { type: 'bundle', reason: 'The document declares a bundleVersion revision counter.' };
    }

    // `bundleVersion` is optional, so fall back to the version itself: a bundle
    // declares the number 1, a draft the string "1.0". A hand-written draft
    // that spells its version numerically is read as a bundle here — pass
    // `--type draft` to say otherwise.
    if (document.schemaVersion === 1) {
      return {
        type: 'bundle',
        reason: 'The document declares the numeric bundle schemaVersion 1.',
      };
    }

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
