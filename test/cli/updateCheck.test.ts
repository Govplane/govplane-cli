import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it, jest,
} from '@jest/globals';
import { readCliVersion } from '../../src/core/environment.js';
import { ExitCode } from '../../src/core/exitCodes.js';
import { createSandbox, runCli, type Sandbox } from '../helpers/harness.js';

const originalFetch = globalThis.fetch;

const stubFetch = (implementation: () => Promise<unknown>): void => {
  (globalThis as { fetch: unknown }).fetch = jest.fn(implementation);
};

describe('govplane version --check', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
    (globalThis as { fetch: unknown }).fetch = originalFetch;
  });

  it('reports when the installed version is current', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: readCliVersion() }),
    }));

    const result = await runCli(['version', '--check'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('You are running the latest version.');
  });

  it('reports an available update with upgrade instructions', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: '99.0.0' }),
    }));

    const result = await runCli(['version', '--check'], sandbox);
    expect(result.stdout).toContain('A newer version is available: 99.0.0');
    expect(result.stdout).toContain('npm install --global @govplane/cli@latest');
  });

  it('does not fail the command when the registry is unreachable', async () => {
    stubFetch(async () => {
      throw new Error('network unreachable');
    });

    const result = await runCli(['version', '--check'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('Update check could not be completed');
  });

  it('handles an error response from the registry', async () => {
    stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));

    const result = await runCli(['version', '--check'], sandbox);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain('503');
  });

  it('includes the update check in JSON output', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ version: '99.0.0' }),
    }));

    const result = await runCli(['version', '--check', '--format', 'json'], sandbox);
    const payload = result.json() as { updateCheck: { updateAvailable: boolean } };
    expect(payload.updateCheck.updateAvailable).toBe(true);
  });

  it('never contacts the network without --check', async () => {
    const fetchSpy = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    (globalThis as { fetch: unknown }).fetch = fetchSpy;

    await runCli(['version'], sandbox);
    await runCli(['validate', '--help'], sandbox);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('CLI toolkit aware behaviour', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
    mkdirSync(join(sandbox.home, 'kit'), { recursive: true });
    writeFileSync(join(sandbox.home, 'kit', 'kit.json'), JSON.stringify({ version: '2.0.0' }));
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('reports the installed kit version', async () => {
    const result = await runCli(['version', '--verbose'], sandbox);
    expect(result.stdout).toContain('2.0.0');
  });

  it('reports an installed kit when --install-kit is used', async () => {
    const result = await runCli(['--install-kit'], sandbox);
    expect(result.stdout).toContain('already installed');
  });

  it('does not send the user in a circle when the kit lacks a command', async () => {
    const result = await runCli(['simulate'], sandbox);

    expect(result.code).toBe(ExitCode.ToolkitUnavailable);
    expect(result.stderr).toContain('does not provide "simulate" yet');
    expect(result.stderr).toContain('npm install --global @govplane/toolkit@latest');
    expect(result.stderr).not.toContain('govplane --install-kit');
  });

  it('points at activation once the kit is installed', async () => {
    const result = await runCli(['--install-kit'], sandbox);

    expect(result.stdout).toContain('already installed');
    expect(result.stdout).toContain('govplane activate');
  });
});
