import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import { ExitCode } from '../../src/core/exitCodes.js';
import { readUserConfig } from '../../src/core/userConfig.js';
import { createSandbox, runCli, type Sandbox } from '../helpers/harness.js';
import { validBundleWithChecksum } from '../helpers/fixtures.js';

describe('command dispatch', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('prints general help when invoked without arguments', async () => {
    const result = await runCli([], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('Basic commands:');
    expect(result.stdout).toContain('Runtime Kit commands:');
  });

  it('documents a single command', async () => {
    const result = await runCli(['help', 'validate'], sandbox);
    expect(result.stdout).toContain('govplane validate [file] [options]');
    expect(result.stdout).toContain('--strict');
  });

  it('supports --help on a command', async () => {
    const result = await runCli(['inspect', '--help'], sandbox);
    expect(result.stdout).toContain('govplane inspect [file] [options]');
  });

  it('suggests a command after a typo', async () => {
    const result = await runCli(['validte'], sandbox);
    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).toContain('Unknown command: validte');
    expect(result.stderr).toContain('validate');
  });

  it('rejects unknown commands without a close match', async () => {
    const result = await runCli(['teleport'], sandbox);
    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).not.toContain('Did you mean?');
  });

  it('rejects options a command does not support', async () => {
    const result = await runCli(['version', '--strict'], sandbox);

    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).toContain('Unknown option: --strict');
    expect(result.stderr).toContain('running "govplane version"');
    expect(result.stderr).toContain('govplane help version');
  });


  it('reports Runtime Kit commands as unavailable without installing anything', async () => {
    const result = await runCli(['build'], sandbox);
    expect(result.code).toBe(ExitCode.RuntimeKitUnavailable);
    expect(result.stderr).toContain('requires the Govplane Runtime Kit');
    expect(result.stderr).toContain('govplane --install-kit');
  });

  it('explains how to install the Runtime Kit', async () => {
    const result = await runCli(['--install-kit'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('npm install --global @govplane/toolkit');
  });
});

describe('govplane version', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('prints the CLI version', async () => {
    const result = await runCli(['version'], sandbox);
    expect(result.stdout).toMatch(/^Govplane CLI \d+\.\d+\.\d+/);
  });

  it('supports -v before any command', async () => {
    const result = await runCli(['-v'], sandbox);
    expect(result.stdout).toContain('Govplane CLI');
  });

  it('prints diagnostics in verbose mode', async () => {
    const result = await runCli(['version', '--verbose'], sandbox);
    expect(result.stdout).toContain('Node.js:');
    expect(result.stdout).toContain('Runtime Kit:');
    expect(result.stdout).toContain('Not installed');
  });

  it('emits machine-readable version information', async () => {
    const result = await runCli(['version', '--format', 'json'], sandbox);
    const payload = result.json() as Record<string, unknown>;
    expect(payload.cliVersion).toBeDefined();
    expect(payload.runtimeKit).toEqual({ installed: false, version: null });
  });
});

describe('govplane working-folder', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('shows the current terminal directory by default', async () => {
    const result = await runCli(['working-folder'], sandbox);
    expect(result.stdout.trim()).toBe(sandbox.project);
  });

  it('reports the resolution source in verbose mode', async () => {
    const result = await runCli(['working-folder', '--verbose'], sandbox);
    expect(result.stdout).toContain('Current terminal directory');
  });

  it('persists and resets the working folder', async () => {
    sandbox.writeJson('governance/policy-bundle.json', validBundleWithChecksum());

    const set = await runCli(['working-folder', 'set', './governance'], sandbox);
    expect(set.code).toBe(ExitCode.Success);
    expect(readUserConfig(sandbox.env).workingFolder).toBe(join(sandbox.project, 'governance'));

    const validated = await runCli(['validate'], sandbox);
    expect(validated.code).toBe(ExitCode.Success);

    const reset = await runCli(['working-folder', 'reset'], sandbox);
    expect(reset.stdout).toContain('Persisted working folder removed.');
    expect(readUserConfig(sandbox.env).workingFolder).toBeUndefined();
  });

  it('refuses to persist a missing directory without --create', async () => {
    const result = await runCli(['working-folder', 'set', './missing'], sandbox);
    expect(result.code).toBe(ExitCode.FileError);
    expect(result.stderr).toContain('--create');
  });

  it('creates the directory with --create', async () => {
    const result = await runCli(['working-folder', 'set', './governance', '--create'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(existsSync(join(sandbox.project, 'governance'))).toBe(true);
  });

  it('requires a path for set', async () => {
    const result = await runCli(['working-folder', 'set'], sandbox);
    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).toContain('A path is required.');
  });

  it('rejects unknown subcommands', async () => {
    const result = await runCli(['working-folder', 'delete'], sandbox);
    expect(result.code).toBe(ExitCode.InvalidArguments);
    expect(result.stderr).toContain('Unknown working-folder subcommand');
  });

  it('initialises project files without overwriting them', async () => {
    const first = await runCli(['working-folder', 'init'], sandbox);
    expect(first.code).toBe(ExitCode.Success);
    expect(existsSync(join(sandbox.project, 'govplane.config.json'))).toBe(true);
    expect(existsSync(join(sandbox.project, 'policy-drafts.json'))).toBe(true);
    expect(existsSync(join(sandbox.project, '.govplane', 'temp'))).toBe(true);

    sandbox.writeText('govplane.config.json', '{"custom":true}');
    const second = await runCli(['working-folder', 'init'], sandbox);
    expect(second.stdout).toContain('Use --force to replace generated files.');
    expect(readFileSync(join(sandbox.project, 'govplane.config.json'), 'utf8'))
      .toBe('{"custom":true}');
  });

  it('backs up existing files when forced', async () => {
    await runCli(['working-folder', 'init'], sandbox);
    sandbox.writeText('govplane.config.json', '{"custom":true}');

    const forced = await runCli(['working-folder', 'init', '--force', '--format', 'json'], sandbox);
    const payload = forced.json() as { files: { action: string; backup?: string }[] };
    const replaced = payload.files.find((file) => file.action === 'replaced');

    expect(replaced).toBeDefined();
    expect(existsSync(replaced?.backup as string)).toBe(true);
    expect(readFileSync(replaced?.backup as string, 'utf8')).toBe('{"custom":true}');
  });

  it('initialises a document that validates cleanly', async () => {
    await runCli(['working-folder', 'init'], sandbox);
    const result = await runCli(['validate'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
  });
});
