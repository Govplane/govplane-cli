import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import {
  assertUsableWorkingFolder, resolvePath, resolveWorkingFolder, WORKING_FOLDER_ENV,
} from '../../src/core/workingFolder.js';
import { createSandbox, type Sandbox } from '../helpers/harness.js';

describe('resolveWorkingFolder', () => {
  const cwd = '/workspace/app';

  it('prefers the command flag over every other source', () => {
    const resolved = resolveWorkingFolder({
      flag: '/from/flag',
      env: { [WORKING_FOLDER_ENV]: '/from/env' },
      persisted: '/from/config',
      cwd,
    });
    expect(resolved).toEqual({ path: '/from/flag', source: 'command-flag' });
  });

  it('falls back to the environment variable', () => {
    const resolved = resolveWorkingFolder({
      env: { [WORKING_FOLDER_ENV]: '/from/env' },
      persisted: '/from/config',
      cwd,
    });
    expect(resolved).toEqual({ path: '/from/env', source: 'environment-variable' });
  });

  it('falls back to persisted configuration', () => {
    const resolved = resolveWorkingFolder({ env: {}, persisted: '/from/config', cwd });
    expect(resolved).toEqual({ path: '/from/config', source: 'persisted-configuration' });
  });

  it('falls back to the current terminal directory', () => {
    const resolved = resolveWorkingFolder({ env: {}, cwd });
    expect(resolved).toEqual({ path: cwd, source: 'current-directory' });
  });

  it('resolves relative paths against the terminal directory', () => {
    const resolved = resolveWorkingFolder({ flag: '../api', env: {}, cwd });
    expect(resolved.path).toBe('/workspace/api');
  });

  it('ignores blank values', () => {
    const resolved = resolveWorkingFolder({
      flag: '   ', env: { [WORKING_FOLDER_ENV]: '' }, persisted: '', cwd,
    });
    expect(resolved.source).toBe('current-directory');
  });
});

describe('resolvePath', () => {
  it('keeps absolute paths', () => {
    expect(resolvePath('/srv/api', '/workspace')).toBe('/srv/api');
  });

  it('resolves relative paths', () => {
    expect(resolvePath('./api', '/workspace')).toBe('/workspace/api');
  });
});

describe('assertUsableWorkingFolder', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('accepts an existing readable directory', () => {
    expect(() => assertUsableWorkingFolder(sandbox.project)).not.toThrow();
  });

  it('reports a missing directory with an actionable message', () => {
    expect(() => assertUsableWorkingFolder(join(sandbox.root, 'missing')))
      .toThrow('Working folder does not exist.');
  });

  it('rejects a path that is not a directory', () => {
    const file = join(sandbox.root, 'file.json');
    writeFileSync(file, '{}');
    expect(() => assertUsableWorkingFolder(file)).toThrow('Working folder is not a directory.');
  });

  it('rejects a read-only directory when the command needs to write', () => {
    const readOnly = join(sandbox.root, 'read-only');
    mkdirSync(readOnly);
    chmodSync(readOnly, 0o500);
    try {
      expect(() => assertUsableWorkingFolder(readOnly, { requireWritable: true }))
        .toThrow('Working folder is not writable.');
    } finally {
      chmodSync(readOnly, 0o700);
    }
  });
});
