import type { DocumentType } from '../types.js';

export interface ValidationIssue {
  /** Stable machine-readable code, e.g. `INVALID_RULE_TARGET`. */
  code: string;
  /** JSON path into the document, e.g. `$.policies[2].policyKey`. */
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationStats {
  policies: number;
  rules: number;
  schemaVersion?: number | string;
  env?: string;
}

export interface ValidationResult {
  valid: boolean;
  documentType: DocumentType;
  file: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: ValidationStats;
}

/**
 * Accumulates every problem found in a document.
 *
 * Validation never stops at the first error: the CLI is expected to report all
 * detectable issues in a single run so users can fix them in one pass.
 */
export class IssueCollector {
  readonly errors: ValidationIssue[] = [];

  readonly warnings: ValidationIssue[] = [];

  error(code: string, path: string, message: string): void {
    this.errors.push({ code, path, message });
  }

  warn(code: string, path: string, message: string): void {
    this.warnings.push({ code, path, message });
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

export const indexPath = (base: string, index: number): string => `${base}[${index}]`;
