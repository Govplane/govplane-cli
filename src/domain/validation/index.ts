import { detectDocumentType } from '../detect.js';
import { isRecord, type DocumentType, type DocumentTypeOption } from '../types.js';
import { validateBundle, type BundleScope } from './bundle.js';
import { ValidationCode } from './codes.js';
import { validateDraft } from './draft.js';
import { IssueCollector, type ValidationResult } from './result.js';

/** How the scope profile is chosen. `auto` reads it from the document. */
export type ScopeOption = BundleScope | 'auto';

export interface ValidateDocumentInput {
  document: unknown;
  file: string;
  /** `auto` infers the type from the document contents. */
  type?: DocumentTypeOption;
  /**
   * Whether a bundle's `orgId` and `projectId` are required. `auto` infers it
   * from the document, and is the default — matching `type`, which infers the
   * document's kind the same way.
   */
  scope?: ScopeOption;
}

/**
 * Chooses the scope profile a bundle should be judged against.
 *
 * A bundle carrying no scope at all is what `govplane build` writes when no
 * organisation and project were given — the local-first shape the build spec
 * calls for in section 6.3, and what the `minimal-local` signing fixture
 * represents. Requiring a scope there would have the CLI reject its own output,
 * and `govplane build` already reports the absence as a warning.
 *
 * Half a scope is a different thing: somebody meant to scope the bundle and
 * stopped, or a configuration only partly applied. That stays an error.
 *
 * This mirrors the SDKs, where the rule set defaults to `required` and the
 * caller that knows the bundle's provenance picks the profile. A file on disk
 * carries no provenance, so its own shape is the only honest signal there is.
 */
const resolveScope = (document: unknown): BundleScope => {
  if (!isRecord(document)) {
    return 'required';
  }
  // Presence, not usability: an explicit `"orgId": ""` is a scope somebody
  // started declaring, so it is held to the stricter profile and reported.
  return document.orgId === undefined && document.projectId === undefined
    ? 'optional'
    : 'required';
};

/**
 * Entry point for document validation: resolves the document type, runs the
 * matching rule set and returns every error and warning found.
 */
export const validateDocument = (input: ValidateDocumentInput): ValidationResult => {
  const requested = input.type ?? 'auto';
  const detection = detectDocumentType(input.document);
  const documentType: DocumentType = requested === 'auto' ? detection.type : requested;

  if (documentType === 'unknown') {
    const issues = new IssueCollector();
    issues.error(ValidationCode.UnknownDocumentType, '$', detection.reason);
    return {
      valid: false,
      documentType,
      file: input.file,
      errors: issues.errors,
      warnings: issues.warnings,
      stats: { policies: 0, rules: 0 },
    };
  }

  const requestedScope = input.scope ?? 'auto';
  const scope = requestedScope === 'auto' ? resolveScope(input.document) : requestedScope;

  const { issues, stats } = documentType === 'bundle'
    ? validateBundle(input.document, { scope })
    : validateDraft(input.document);

  if (requested !== 'auto' && detection.type !== 'unknown' && detection.type !== requested) {
    issues.warn(
      ValidationCode.DocumentTypeMismatch,
      '$',
      `Validated as "${requested}", but the document looks like a "${detection.type}".`,
    );
  }

  return {
    valid: !issues.hasErrors,
    documentType,
    file: input.file,
    errors: issues.errors,
    warnings: issues.warnings,
    stats,
  };
};

export * from './codes.js';
export * from './result.js';
