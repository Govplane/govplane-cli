import { detectDocumentType } from '../detect.js';
import type { DocumentType, DocumentTypeOption } from '../types.js';
import { validateBundle } from './bundle.js';
import { ValidationCode } from './codes.js';
import { validateDraft } from './draft.js';
import { IssueCollector, type ValidationResult } from './result.js';

export interface ValidateDocumentInput {
  document: unknown;
  file: string;
  /** `auto` infers the type from the document contents. */
  type?: DocumentTypeOption;
}

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

  const { issues, stats } = documentType === 'bundle'
    ? validateBundle(input.document)
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
