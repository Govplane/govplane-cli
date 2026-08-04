import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import {
  loadProjectConfig, resolveBundlePath, resolveDraftPath, resolveMaxFileBytes,
} from '../../src/core/projectConfig.js';
import {
  clearPersistedWorkingFolder, readUserConfig, setPersistedWorkingFolder,
} from '../../src/core/userConfig.js';
import { detectRuntimeKit } from '../../src/core/runtimeKit.js';
import { DEFAULT_MAX_FILE_BYTES } from '../../src/core/files.js';
import { createSandbox, type Sandbox } from '../helpers/harness.js';

describe('project configuration', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('returns defaults when no configuration file exists', () => {
    const loaded = loadProjectConfig(sandbox.project);
    expect(loaded.path).toBeNull();
    expect(resolveDraftPath(loaded.config, sandbox.project))
      .toBe(join(sandbox.project, 'policy-drafts.json'));
    expect(resolveBundlePath(loaded.config, sandbox.project))
      .toBe(join(sandbox.project, 'policy-bundle.json'));
    expect(resolveMaxFileBytes(loaded.config)).toBe(DEFAULT_MAX_FILE_BYTES);
  });

  it('resolves configured paths against the working folder', () => {
    sandbox.writeJson('govplane.config.json', {
      schemaVersion: 1,
      draft: { path: 'policies/drafts.json' },
      bundle: { path: 'dist/runtime-bundle.json' },
      limits: { maxFileBytes: 1024 },
    });

    const loaded = loadProjectConfig(sandbox.project);
    expect(resolveDraftPath(loaded.config, sandbox.project))
      .toBe(join(sandbox.project, 'policies/drafts.json'));
    expect(resolveBundlePath(loaded.config, sandbox.project))
      .toBe(join(sandbox.project, 'dist/runtime-bundle.json'));
    expect(resolveMaxFileBytes(loaded.config)).toBe(1024);
  });

  it('loads an explicit configuration file', () => {
    sandbox.writeJson('config/govplane.prod.json', { bundle: { path: 'prod-bundle.json' } });
    const loaded = loadProjectConfig(sandbox.project, './config/govplane.prod.json');
    expect(loaded.path).toBe(join(sandbox.project, 'config/govplane.prod.json'));
    expect(resolveBundlePath(loaded.config, sandbox.project))
      .toBe(join(sandbox.project, 'prod-bundle.json'));
  });

  it('fails when an explicit configuration file is missing', () => {
    expect(() => loadProjectConfig(sandbox.project, './missing.json'))
      .toThrow('Configuration file not found');
  });

  it('fails on malformed configuration', () => {
    sandbox.writeText('govplane.config.json', '{ not json');
    expect(() => loadProjectConfig(sandbox.project)).toThrow('not valid JSON');
  });

  it('rejects a configuration document that is not an object', () => {
    sandbox.writeText('govplane.config.json', '[]');
    expect(() => loadProjectConfig(sandbox.project)).toThrow('must contain a JSON object');
  });
});

describe('user configuration', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('returns an empty configuration when nothing is persisted', () => {
    expect(readUserConfig(sandbox.env).workingFolder).toBeUndefined();
  });

  it('persists and clears the working folder', () => {
    setPersistedWorkingFolder('/srv/api', sandbox.env);
    expect(readUserConfig(sandbox.env).workingFolder).toBe('/srv/api');

    expect(clearPersistedWorkingFolder(sandbox.env)).toBe(true);
    expect(readUserConfig(sandbox.env).workingFolder).toBeUndefined();
    expect(clearPersistedWorkingFolder(sandbox.env)).toBe(false);
  });

  it('ignores a corrupted configuration file instead of failing', () => {
    setPersistedWorkingFolder('/srv/api', sandbox.env);
    const configPath = join(sandbox.home, 'config.json');
    // Overwrite the persisted configuration with invalid JSON.
    writeFileSync(configPath, '{ broken');
    expect(readUserConfig(sandbox.env).workingFolder).toBeUndefined();
  });
});

describe('runtime kit detection', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('reports the kit as missing when no manifest exists', () => {
    const status = detectRuntimeKit(sandbox.env);
    expect(status.installed).toBe(false);
    expect(status.version).toBeNull();
  });

  it('reads the version from an installed kit manifest', () => {
    mkdirSync(join(sandbox.home, 'kit'), { recursive: true });
    writeFileSync(join(sandbox.home, 'kit', 'kit.json'), JSON.stringify({ version: '1.2.3' }));

    const status = detectRuntimeKit(sandbox.env);
    expect(status.installed).toBe(true);
    expect(status.version).toBe('1.2.3');
  });
});
