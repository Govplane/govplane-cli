import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import { ExitCode } from '../../src/core/exitCodes.js';
import {
  createSandbox, runCli, type Sandbox,
} from '../helpers/harness.js';
import { validBundleWithChecksum, validDraft } from '../helpers/fixtures.js';

describe('govplane validate', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('validates the default bundle and draft', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    sandbox.writeJson('policy-drafts.json', validDraft());

    const result = await runCli(['validate'], sandbox);

    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('policy-bundle.json is valid');
    expect(result.stdout).toContain('policy-drafts.json is valid');
  });

  it('validates an explicit file', async () => {
    const path = sandbox.writeJson('custom/policies.json', validBundleWithChecksum());
    const result = await runCli(['validate', path], sandbox);
    expect(result.code).toBe(ExitCode.Success);
  });

  it('fails with an actionable error when no document exists', async () => {
    const result = await runCli(['validate'], sandbox);
    expect(result.code).toBe(ExitCode.FileError);
    expect(result.stderr).toContain('No Govplane draft or bundle was found');
    expect(result.stderr).toContain('policy-bundle.json');
  });

  it('reports validation errors with JSON paths and codes', async () => {
    sandbox.writeJson('policy-bundle.json', {
      schemaVersion: 1,
      orgId: 'o',
      projectId: 'p',
      env: 'prod',
      generatedAt: '2026-07-25T12:00:00.000Z',
      policies: [
        { policyKey: 'dup', activeVersion: 1, defaults: { effect: 'allow' }, rules: [] },
        { policyKey: 'dup', activeVersion: 1, defaults: { effect: 'allow' }, rules: [] },
      ],
    });

    const result = await runCli(['validate'], sandbox);

    expect(result.code).toBe(ExitCode.Failure);
    expect(result.stderr).toContain('Validation failed');
    expect(result.stderr).toContain('policies[1].policyKey');
    expect(result.stderr).toContain('DUPLICATE_POLICY_KEY');
  });

  it('reports malformed JSON as a validation failure', async () => {
    sandbox.writeText('policy-bundle.json', '{ "schemaVersion": 1, ');
    const result = await runCli(['validate'], sandbox);
    expect(result.code).toBe(ExitCode.Failure);
    expect(result.stderr).toContain('INVALID_JSON');
  });

  it('stays silent on success in quiet mode', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['validate', '--quiet'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toBe('');
  });

  it('treats warnings as errors in strict mode', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());

    const normal = await runCli(['validate'], sandbox);
    expect(normal.code).toBe(ExitCode.Success);

    const strict = await runCli(['validate', '--strict'], sandbox);
    expect(strict.code).toBe(ExitCode.Failure);
    expect(strict.stderr).toContain('Strict mode');
  });

  it('emits a single JSON object for one document', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['validate', '--format', 'json'], sandbox);
    const payload = result.json() as Record<string, unknown>;

    expect(payload.valid).toBe(true);
    expect(payload.documentType).toBe('bundle');
    expect(Array.isArray(payload.errors)).toBe(true);
  });

  it('emits a results array for multiple documents', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    sandbox.writeJson('policy-drafts.json', validDraft());

    const result = await runCli(['validate', '--format', 'json'], sandbox);
    const payload = result.json() as { results: unknown[] };
    expect(payload.results).toHaveLength(2);
  });

  it('honours an explicit document type', async () => {
    const path = sandbox.writeJson('drafts.json', validDraft());
    const argv = ['validate', path, '--type', 'bundle', '--format', 'json'];
    const result = await runCli(argv, sandbox);
    const payload = result.json() as { documentType: string };
    expect(payload.documentType).toBe('bundle');
    expect(result.code).toBe(ExitCode.Failure);
  });

  it('rejects an unsupported --type value', async () => {
    const result = await runCli(['validate', '--type', 'policy'], sandbox);
    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).toContain('Invalid value for --type');
  });

  it('uses configured document paths', async () => {
    sandbox.writeJson('govplane.config.json', { bundle: { path: 'dist/bundle.json' } });
    sandbox.writeJson('dist/bundle.json', validBundleWithChecksum());

    const result = await runCli(['validate'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('dist/bundle.json is valid');
  });

  it('resolves the working folder from the -w flag', async () => {
    sandbox.writeJson('governance/policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['validate', '-w', './governance'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
  });

  it('fails when the working folder does not exist', async () => {
    const result = await runCli(['validate', '-w', './missing'], sandbox);
    expect(result.code).toBe(ExitCode.FileError);
    expect(result.stderr).toContain('Working folder does not exist.');
  });
});
