import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import { ExitCode } from '../../src/core/exitCodes.js';
import { createSandbox, runCli, type Sandbox } from '../helpers/harness.js';
import {
  analyzeDraft, signedBundle, validBundleWithChecksum, validDraft,
} from '../helpers/fixtures.js';

describe('govplane inspect', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('summarises the default bundle', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['inspect'], sandbox);

    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('Govplane Policy Bundle');
    expect(result.stdout).toContain('Policies: 1');
    expect(result.stdout).toContain('matches canonical payload');
  });

  it('falls back to the draft when no bundle exists', async () => {
    sandbox.writeJson('policy-drafts.json', validDraft());
    const result = await runCli(['inspect'], sandbox);
    expect(result.stdout).toContain('Govplane Policy Drafts');
  });

  it('lists policies', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['inspect', '--policies'], sandbox);
    expect(result.stdout).toContain('KEY');
    expect(result.stdout).toContain('login-protection');
  });

  it('shows a single policy', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['inspect', '--policy', 'login-protection'], sandbox);
    expect(result.stdout).toContain('Policy: login-protection');
    expect(result.stdout).toContain('failedAttempts');
  });

  it('fails when the requested policy does not exist', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['inspect', '--policy', 'missing'], sandbox);
    expect(result.code).toBe(ExitCode.Failure);
    expect(result.stderr).toContain('Policy not found');
  });

  it('lists targets and context fields', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());

    const targets = await runCli(['inspect', '--targets'], sandbox);
    expect(targets.stdout).toContain('auth / login / authenticate');

    const context = await runCli(['inspect', '--context'], sandbox);
    expect(context.stdout).toContain('failedAttempts');
  });

  it('reports signature metadata without a verification key', async () => {
    const { bundle } = signedBundle();
    sandbox.writeJson('policy-bundle.json', bundle);

    const result = await runCli(['inspect', '--signature'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('Not verified');
    expect(result.stdout).toContain('Public verification key is not available.');
  });

  it('verifies a signature with an explicit public key', async () => {
    const { bundle, publicKeyPem } = signedBundle();
    sandbox.writeJson('policy-bundle.json', bundle);
    sandbox.writeText('keys/prod.pem', publicKeyPem);

    const argv = ['inspect', '--signature', '--public-key', './keys/prod.pem'];
    const result = await runCli(argv, sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('Valid');
  });

  it('exits with the signature failure code when verification fails', async () => {
    const { bundle, publicKeyPem } = signedBundle();
    sandbox.writeJson('policy-bundle.json', { ...bundle, policies: [] });
    sandbox.writeText('keys/prod.pem', publicKeyPem);

    const argv = ['inspect', '--signature', '--public-key', './keys/prod.pem'];
    const result = await runCli(argv, sandbox);
    expect(result.code).toBe(ExitCode.Compatibility);
    expect(result.stdout).toContain('Invalid');
  });

  it('reads the verification key from configuration', async () => {
    const { bundle, publicKeyPem } = signedBundle();
    sandbox.writeJson('policy-bundle.json', bundle);
    sandbox.writeText('keys/prod.pem', publicKeyPem);
    sandbox.writeJson('govplane.config.json', { signature: { publicKeyPath: 'keys/prod.pem' } });

    const result = await runCli(['inspect', '--signature'], sandbox);
    expect(result.stdout).toContain('Valid');
  });

  it('reads the verification key from the environment', async () => {
    const { bundle, publicKeyPem } = signedBundle();
    sandbox.writeJson('policy-bundle.json', bundle);

    const result = await runCli(['inspect', '--signature'], sandbox, {
      env: { GOVPLANE_PUBLIC_KEY: publicKeyPem },
    });
    expect(result.stdout).toContain('Valid');
  });

  it('emits machine-readable metadata', async () => {
    sandbox.writeJson('policy-bundle.json', validBundleWithChecksum());
    const result = await runCli(['inspect', '--format', 'json'], sandbox);
    const payload = result.json() as Record<string, unknown>;

    expect(payload.documentType).toBe('bundle');
    expect(payload.checksum).toBeDefined();
    expect(payload.targets).toEqual(['auth / login / authenticate']);
  });

  it('inspects analyze drafts', async () => {
    sandbox.writeJson('policy-drafts.json', analyzeDraft());
    const result = await runCli(['inspect'], sandbox);
    expect(result.stdout).toContain('Shape: analyze');
    expect(result.stdout).toContain('src/middleware/governance.js:18');
  });

  it('fails on an unrecognised document', async () => {
    const path = sandbox.writeJson('other.json', { hello: 'world' });
    const result = await runCli(['inspect', path], sandbox);
    expect(result.code).toBe(ExitCode.Failure);
    expect(result.stderr).toContain('could not be recognised');
  });

  it('fails on malformed JSON', async () => {
    const path = sandbox.writeText('broken.json', '{');
    const result = await runCli(['inspect', path], sandbox);
    expect(result.code).toBe(ExitCode.Failure);
    expect(result.stderr).toContain('could not be parsed');
  });
});
