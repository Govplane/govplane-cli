import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from '@jest/globals';
import {
  atomicWriteFile, backupFile, isDirectory, isFile, readTextFile,
} from '../../src/core/files.js';
import { createSandbox, type Sandbox } from '../helpers/harness.js';

describe('files', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('reads UTF-8 text and strips a byte order mark', () => {
    const path = sandbox.writeText('bom.json', '\uFEFF{"a":1}');
    expect(readTextFile(path)).toBe('{"a":1}');
  });

  it('reports a missing file as a file error', () => {
    expect(() => readTextFile(join(sandbox.project, 'nope.json')))
      .toThrow('File not found');
  });

  it('rejects directories', () => {
    expect(() => readTextFile(sandbox.project)).toThrow('Expected a file but found a directory');
  });

  it('enforces the size limit', () => {
    const path = sandbox.writeText('big.json', 'x'.repeat(64));
    expect(() => readTextFile(path, { maxBytes: 16 })).toThrow('larger than the supported limit');
  });

  it('rejects UTF-16 encoded documents', () => {
    const path = join(sandbox.project, 'utf16.json');
    writeFileSync(path, Buffer.from('fffe7b007d00', 'hex'));
    expect(() => readTextFile(path)).toThrow('Unsupported file encoding');
  });

  it('writes atomically and leaves no temporary files behind', () => {
    const path = join(sandbox.project, 'nested', 'out.json');
    atomicWriteFile(path, '{"ok":true}\n');
    expect(readFileSync(path, 'utf8')).toBe('{"ok":true}\n');
    expect(isDirectory(join(sandbox.project, 'nested'))).toBe(true);
    expect(isFile(path)).toBe(true);
  });

  it('creates a backup before a file is replaced', () => {
    const path = sandbox.writeText('config.json', 'original');
    const backup = backupFile(path, '2026-07-25');
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup, 'utf8')).toBe('original');
  });

  it('reports missing paths through the isFile/isDirectory guards', () => {
    expect(isFile(join(sandbox.project, 'missing'))).toBe(false);
    expect(isDirectory(join(sandbox.project, 'missing'))).toBe(false);
  });
});
