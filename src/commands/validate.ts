import { basename, relative } from 'node:path';
import { readBoolean, readString } from '../args/parser.js';
import {
  commonOptions, formatOption,
} from '../args/options.js';
import { fileError } from '../core/errors.js';
import { ExitCode, type ExitCodeValue } from '../core/exitCodes.js';
import type { Reporter } from '../core/reporter.js';
import { DOCUMENT_TYPES, type DocumentTypeOption } from '../domain/types.js';
import { validateDocument } from '../domain/validation/index.js';
import { ValidationCode } from '../domain/validation/codes.js';
import type { ValidationIssue, ValidationResult } from '../domain/validation/result.js';
import { loadDocument, resolveDocumentTargets, resolveProject } from './context.js';
import type { CommandContext, CommandDefinition } from './types.js';

const displayPath = (path: string): string => (path.startsWith('$.') ? path.slice(2) : path);

const issueLines = (
  reporter: Reporter,
  issues: ValidationIssue[],
  label: 'error' | 'warning',
): string[] => {
  if (issues.length === 0) {
    return [];
  }

  const noun = issues.length === 1 ? label : `${label}s`;
  const lines = ['', `${issues.length} ${noun} found:`];

  issues.forEach((issue, index) => {
    const location = issue.line === undefined
      ? ''
      : ` (line ${issue.line}, column ${issue.column})`;
    lines.push('');
    lines.push(`${index + 1}. ${displayPath(issue.path)}${location}`);
    lines.push(`   ${issue.message}`);
    lines.push(`   ${reporter.muted(issue.code)}`);
  });

  return lines;
};

/** Shows a path relative to the terminal directory, but never a `../../..` chain. */
const displayFile = (file: string, cwd: string): string => {
  const relativePath = relative(cwd, file);
  if (relativePath === '') {
    return basename(file);
  }
  return relativePath.startsWith('..') ? file : relativePath;
};

const printTextResult = (reporter: Reporter, result: ValidationResult, cwd: string): void => {
  const name = displayFile(result.file, cwd);

  if (!result.valid) {
    reporter.error(`${reporter.failure('Validation failed:')} ${name}`);
    reporter.errorLines(issueLines(reporter, result.errors, 'error'));
    reporter.errorLines(issueLines(reporter, result.warnings, 'warning'));
    return;
  }

  reporter.line(`${reporter.success('✓')} ${name} is valid`);
  reporter.line();
  reporter.line(`Type:     ${result.documentType}`);
  reporter.line(`Policies: ${result.stats.policies}`);
  reporter.line(`Rules:    ${result.stats.rules}`);
  if (result.stats.schemaVersion !== undefined) {
    reporter.line(`Schema:   ${result.stats.schemaVersion}`);
  }
  reporter.lines(issueLines(reporter, result.warnings, 'warning'));
};

const toJsonPayload = (results: ValidationResult[], valid: boolean): unknown => {
  if (results.length === 1) {
    const [result] = results as [ValidationResult];
    return { ...result, valid };
  }
  return { valid, results };
};

const run = async (context: CommandContext): Promise<ExitCodeValue> => {
  const { reporter } = context;
  const project = resolveProject(context);
  const targets = resolveDocumentTargets(context, project);
  const strict = readBoolean(context.options, 'strict');
  const requestedType = (readString(context.options, 'type') ?? 'auto') as DocumentTypeOption;

  if (targets.paths.length === 0) {
    throw fileError(
      `No Govplane draft or bundle was found in:\n  ${project.workingFolder.path}`,
      'DOCUMENT_NOT_FOUND',
      [
        '',
        'Expected:',
        `  ${basename(project.bundlePath)}`,
        `  ${basename(project.draftPath)}`,
        '',
        'Validate a specific file with:',
        '  govplane validate <file>',
      ],
    );
  }

  const results: ValidationResult[] = targets.paths.map((path) => {
    reporter.debug(`Validating: ${path}`);
    const loaded = loadDocument(path, project.maxFileBytes);

    if (!loaded.ok) {
      const issue: ValidationIssue = {
        code: ValidationCode.InvalidJson,
        path: '$',
        message: loaded.message,
        ...(loaded.position
          ? { line: loaded.position.line, column: loaded.position.column }
          : {}),
      };
      return {
        valid: false,
        documentType: 'unknown',
        file: path,
        errors: [issue],
        warnings: [],
        stats: { policies: 0, rules: 0 },
      };
    }

    return validateDocument({ document: loaded.document, file: path, type: requestedType });
  });

  const hasErrors = results.some((result) => !result.valid);
  const hasWarnings = results.some((result) => result.warnings.length > 0);
  const valid = !hasErrors && !(strict && hasWarnings);

  if (reporter.format === 'json') {
    reporter.json(toJsonPayload(results, valid));
  } else {
    results.forEach((result, index) => {
      if (index > 0) {
        reporter.line();
      }
      printTextResult(reporter, result, context.cwd);
    });

    if (strict && hasWarnings && !hasErrors) {
      reporter.error('');
      reporter.error('Strict mode: warnings are treated as errors.');
    }
  }

  return valid ? ExitCode.Success : ExitCode.Failure;
};

export const validateCommand: CommandDefinition = {
  name: 'validate',
  summary: 'Validate a policy draft or bundle',
  usage: 'govplane validate [file] [options]',
  description: 'Validate a Govplane policy draft or bundle. The file is never modified.',
  requiresRuntimeKit: false,
  arguments: [
    { name: 'file', description: 'Draft or bundle file to validate' },
  ],
  options: [
    {
      name: 'type',
      type: 'string',
      placeholder: '<type>',
      choices: [...DOCUMENT_TYPES],
      description: 'auto, draft or bundle',
    },
    { name: 'strict', type: 'boolean', description: 'Treat warnings as errors' },
    formatOption,
    ...commonOptions,
  ],
  examples: [
    'govplane validate',
    'govplane validate ./policy-bundle.json --type bundle',
    'govplane validate --strict --format json',
  ],
  run,
};
