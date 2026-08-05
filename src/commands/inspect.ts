import { existsSync } from 'node:fs';
import { commonOptions, formatOption } from '../args/options.js';
import { readBoolean, readString } from '../args/parser.js';
import { CliError, fileError } from '../core/errors.js';
import { ExitCode, type ExitCodeValue } from '../core/exitCodes.js';
import { readTextFile } from '../core/files.js';
import type { Reporter } from '../core/reporter.js';
import { resolvePath } from '../core/workingFolder.js';
import { detectDocumentType } from '../domain/detect.js';
import { inspectSignature, type SignatureInspection } from '../domain/signature.js';
import {
  collectContextUsage, collectTargets, formatTarget, summariseBundle, summariseDraft,
  type BundleSummary, type DraftSummary, type PolicySummary,
} from '../domain/summary.js';
import { loadDocument, resolveProject, type ResolvedProject } from './context.js';
import type { CommandContext, CommandDefinition } from './types.js';

const PUBLIC_KEY_ENV = 'GOVPLANE_PUBLIC_KEY';
const PUBLIC_KEY_PATH_ENV = 'GOVPLANE_PUBLIC_KEY_PATH';

const COLUMN_GAP = '  ';

const printTable = (
  reporter: Reporter,
  headers: string[],
  rows: string[][],
): void => {
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => (row[index] ?? '').length),
  ));

  const renderRow = (cells: string[]): string => cells
    .map((cell, index) => cell.padEnd(widths[index] ?? 0, ' '))
    .join(COLUMN_GAP)
    .trimEnd();

  reporter.line(renderRow(headers));
  rows.forEach((row) => reporter.line(renderRow(row)));
};

const targetsLabel = (policy: PolicySummary): string => {
  if (policy.targets.length === 0) {
    return '—';
  }
  const [first] = policy.targets as [PolicySummary['targets'][number]];
  const extra = policy.targets.length - 1;
  return extra > 0 ? `${formatTarget(first)} (+${extra})` : formatTarget(first);
};

/** Resolves verification material from the flag, configuration or environment. */
const resolvePublicKey = (
  context: CommandContext,
  project: ResolvedProject,
): string | undefined => {
  const flag = readString(context.options, 'public-key');
  if (flag !== undefined) {
    return readTextFile(resolvePath(flag, context.cwd));
  }

  const configured = project.config.signature?.publicKeyPath;
  if (configured !== undefined) {
    return readTextFile(resolvePath(configured, project.workingFolder.path));
  }

  const inlineKey = context.env[PUBLIC_KEY_ENV];
  if (inlineKey !== undefined && inlineKey.trim() !== '') {
    return inlineKey;
  }

  const keyPath = context.env[PUBLIC_KEY_PATH_ENV];
  if (keyPath !== undefined && keyPath.trim() !== '') {
    return readTextFile(resolvePath(keyPath, context.cwd));
  }

  return undefined;
};

const printBundleOverview = (reporter: Reporter, file: string, summary: BundleSummary): void => {
  reporter.line(reporter.heading('Govplane Policy Bundle'));
  reporter.line();
  reporter.line('File:');
  reporter.line(`  ${file}`);
  reporter.line();
  reporter.line('Bundle:');
  reporter.line(`  Schema: ${summary.schemaVersion ?? 'unknown'}`);
  reporter.line(`  Organisation: ${summary.orgId ?? 'unknown'}`);
  reporter.line(`  Project: ${summary.projectId ?? 'unknown'}`);
  reporter.line(`  Environment: ${summary.env ?? 'unknown'}`);
  reporter.line(`  Generated at: ${summary.generatedAt ?? 'unknown'}`);
  reporter.line(`  Bundle version: ${summary.bundleVersion ?? 'not set'}`);
  reporter.line();
  reporter.line('Contents:');
  reporter.line(`  Policies: ${summary.totals.policies}`);
  reporter.line(`  Active policies: ${summary.totals.activePolicies}`);
  reporter.line(`  Disabled policies: ${summary.totals.disabledPolicies}`);
  reporter.line(`  Rules: ${summary.totals.rules}`);

  if (summary.checksum !== undefined) {
    const state = summary.checksumMatches === true
      ? 'matches canonical payload'
      : 'does not match canonical payload';
    reporter.line();
    reporter.line('Integrity:');
    reporter.line(`  Checksum: ${summary.checksum}`);
    reporter.line(`  Status: ${state}`);
    if (summary.etag !== undefined) {
      reporter.line(`  ETag: W/${summary.etag}`);
    }
  }

  reporter.line();
  reporter.line('Signature:');
  if (summary.signature === undefined) {
    reporter.line('  Status: Not signed');
  } else {
    reporter.line('  Status: Metadata present');
    reporter.line(`  Algorithm: ${summary.signature.algorithm}`);
    reporter.line(`  Key ID: ${summary.signature.keyId}`);
  }
};

const printSignature = (reporter: Reporter, inspection: SignatureInspection): void => {
  reporter.line(reporter.heading('Signature verification'));
  reporter.line();

  if (inspection.status === 'absent') {
    reporter.line('Status:');
    reporter.line('  No signature metadata found.');
    return;
  }

  const statusLabel: Record<Exclude<SignatureInspection['status'], 'absent'>, string> = {
    valid: 'Valid',
    invalid: 'Invalid',
    unverified: 'Not verified',
  };

  reporter.line('Status:');
  reporter.line(`  ${statusLabel[inspection.status]}`);

  if (inspection.algorithm !== undefined) {
    reporter.line();
    reporter.line('Algorithm:');
    reporter.line(`  ${inspection.algorithm}`);
  }
  if (inspection.keyId !== undefined) {
    reporter.line();
    reporter.line('Key ID:');
    reporter.line(`  ${inspection.keyId}`);
  }
  if (inspection.reason !== undefined) {
    reporter.line();
    reporter.line('Reason:');
    reporter.line(`  ${inspection.reason}`);
  }
};

const printPolicyDetail = (
  reporter: Reporter,
  summary: BundleSummary,
  policyKey: string,
): ExitCodeValue => {
  const policy = summary.policies.find((entry) => entry.policyKey === policyKey);
  if (policy === undefined) {
    throw new CliError(`Policy not found: ${policyKey}`, {
      code: 'POLICY_NOT_FOUND',
      exitCode: ExitCode.Failure,
      details: ['', 'List available policies with:', '  govplane inspect --policies'],
    });
  }

  reporter.line(`${reporter.heading('Policy:')} ${policy.policyKey}`);
  if (policy.friendlyName !== undefined) {
    reporter.line();
    reporter.line('Friendly name:');
    reporter.line(`  ${policy.friendlyName}`);
  }
  reporter.line();
  reporter.line('Targets:');
  if (policy.targets.length === 0) {
    reporter.line('  (none)');
  } else {
    policy.targets.forEach((target) => reporter.line(`  ${formatTarget(target)}`));
  }
  reporter.line();
  reporter.line('Default effect:');
  reporter.line(`  ${policy.defaultsEffect ?? 'not set'}`);
  reporter.line();
  reporter.line('Rules:');
  reporter.line(`  ${policy.rules}`);
  reporter.line();
  reporter.line('Context fields:');
  if (policy.contextFields.length === 0) {
    reporter.line('  (none)');
  } else {
    policy.contextFields.forEach((field) => reporter.line(`  ${field}`));
  }

  return ExitCode.Success;
};

const printDraft = (reporter: Reporter, file: string, summary: DraftSummary): void => {
  reporter.line(reporter.heading('Govplane Policy Drafts'));
  reporter.line();
  reporter.line('File:');
  reporter.line(`  ${file}`);
  reporter.line();
  reporter.line(`Shape: ${summary.shape}`);
  reporter.line(`Schema: ${summary.schemaVersion ?? 'unknown'}`);
  if (summary.generatedAt !== undefined) {
    reporter.line(`Generated at: ${summary.generatedAt}`);
  }
  if (summary.env !== undefined) {
    reporter.line(`Environment: ${summary.env}`);
  }
  reporter.line();
  reporter.line(`Total drafts: ${summary.totals.drafts}`);
  reporter.line(`Complete: ${summary.totals.complete}`);
  reporter.line(`Incomplete: ${summary.totals.incomplete}`);
  reporter.line();

  printTable(
    reporter,
    ['KEY', 'TARGET', 'RULES', 'STATUS'],
    summary.entries.map((entry) => [
      entry.key,
      entry.targets.length > 0 ? formatTarget(entry.targets[0] as never) : '—',
      String(entry.rules),
      entry.status,
    ]),
  );

  const withSources = summary.entries.filter((entry) => entry.sources.length > 0);
  if (withSources.length > 0) {
    reporter.line();
    reporter.line('Source locations:');
    withSources.forEach((entry) => {
      entry.sources.forEach((source) => {
        const position = source.line === undefined ? '' : `:${source.line}`;
        reporter.line(`  ${entry.key}  ${source.file}${position}`);
      });
    });
  }
};

const run = async (context: CommandContext): Promise<ExitCodeValue> => {
  const { reporter } = context;
  const project = resolveProject(context);

  const explicit = context.positionals[0];
  const path = explicit !== undefined
    ? resolvePath(explicit, context.cwd)
    : [project.bundlePath, project.draftPath].find((candidate) => existsSync(candidate));

  if (path === undefined) {
    throw fileError(
      `No Govplane draft or bundle was found in:\n  ${project.workingFolder.path}`,
      'DOCUMENT_NOT_FOUND',
      ['', 'Inspect a specific file with:', '  govplane inspect <file>'],
    );
  }

  reporter.debug(`Inspecting: ${path}`);
  const loaded = loadDocument(path, project.maxFileBytes);
  if (!loaded.ok) {
    const position = loaded.position === undefined
      ? []
      : [`Line ${loaded.position.line}, column ${loaded.position.column}`];
    throw new CliError(`Document could not be parsed: ${path}`, {
      code: 'INVALID_JSON',
      exitCode: ExitCode.Failure,
      details: [loaded.message, ...position],
    });
  }

  const detection = detectDocumentType(loaded.document);
  reporter.debug(`Document type: ${detection.type} (${detection.reason})`);

  if (detection.type === 'unknown') {
    throw new CliError(`Document could not be recognised: ${path}`, {
      code: 'UNKNOWN_DOCUMENT_TYPE',
      exitCode: ExitCode.Failure,
      details: [detection.reason],
    });
  }

  if (detection.type === 'draft') {
    const summary = summariseDraft(loaded.document);
    if (reporter.format === 'json') {
      reporter.json({ documentType: 'draft', file: path, ...summary });
    } else {
      printDraft(reporter, path, summary);
    }
    return ExitCode.Success;
  }

  const summary = summariseBundle(loaded.document);
  const wantsPolicies = readBoolean(context.options, 'policies');
  const wantsTargets = readBoolean(context.options, 'targets');
  const wantsContext = readBoolean(context.options, 'context');
  const wantsSignature = readBoolean(context.options, 'signature');
  const policyKey = readString(context.options, 'policy');

  const signature = wantsSignature
    ? inspectSignature({ bundle: loaded.document, publicKey: resolvePublicKey(context, project) })
    : undefined;

  if (reporter.format === 'json') {
    reporter.json({
      documentType: 'bundle',
      file: path,
      ...summary,
      targets: collectTargets(summary.policies),
      context: collectContextUsage(summary.policies),
      ...(signature ? { signatureVerification: signature } : {}),
    });
    return signature?.status === 'invalid' ? ExitCode.Compatibility : ExitCode.Success;
  }

  if (policyKey !== undefined) {
    return printPolicyDetail(reporter, summary, policyKey);
  }

  if (wantsPolicies) {
    reporter.line(reporter.heading('Policies'));
    reporter.line();
    printTable(
      reporter,
      ['KEY', 'TARGET', 'RULES', 'STATUS'],
      summary.policies.map((policy) => [
        policy.policyKey,
        targetsLabel(policy),
        String(policy.rules),
        policy.status,
      ]),
    );
    return ExitCode.Success;
  }

  if (wantsTargets) {
    reporter.line(reporter.heading('Covered targets'));
    reporter.line();
    const targets = collectTargets(summary.policies);
    if (targets.length === 0) {
      reporter.line('(none)');
    } else {
      targets.forEach((target) => reporter.line(target));
    }
    return ExitCode.Success;
  }

  if (wantsContext) {
    reporter.line(reporter.heading('Context fields referenced by policies'));
    reporter.line();
    const usage = collectContextUsage(summary.policies);
    if (usage.length === 0) {
      reporter.line('(none)');
    } else {
      printTable(
        reporter,
        ['FIELD', 'POLICIES'],
        usage.map((entry) => [entry.field, entry.policies.join(', ')]),
      );
    }
    return ExitCode.Success;
  }

  if (signature !== undefined) {
    printSignature(reporter, signature);
    return signature.status === 'invalid' ? ExitCode.Compatibility : ExitCode.Success;
  }

  printBundleOverview(reporter, path, summary);
  return ExitCode.Success;
};

export const inspectCommand: CommandDefinition = {
  name: 'inspect',
  summary: 'Inspect a policy draft or bundle',
  usage: 'govplane inspect [file] [options]',
  description: 'Display a human-readable summary of a Govplane draft or bundle. '
    + 'The file is never modified.',
  requiresToolkit: false,
  arguments: [
    { name: 'file', description: 'Draft or bundle file to inspect' },
  ],
  options: [
    { name: 'policies', type: 'boolean', description: 'List the policies in the document' },
    {
      name: 'policy',
      type: 'string',
      placeholder: '<policy-key>',
      description: 'Show details for a single policy',
    },
    { name: 'targets', type: 'boolean', description: 'List the targets covered by the document' },
    { name: 'context', type: 'boolean', description: 'List the context fields policies reference' },
    { name: 'signature', type: 'boolean', description: 'Inspect and verify signature metadata' },
    {
      name: 'public-key',
      type: 'string',
      placeholder: '<path>',
      description: 'Public key used to verify the bundle signature',
    },
    formatOption,
    ...commonOptions,
  ],
  examples: [
    'govplane inspect',
    'govplane inspect ./policy-bundle.json --policies',
    'govplane inspect --policy login-protection',
    'govplane inspect --signature --public-key ./keys/prod.pem',
  ],
  run,
};
