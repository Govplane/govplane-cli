import { describe, expect, it } from '@jest/globals';
import { parseArgv, readBoolean, readList, readString } from '../../src/args/parser.js';
import type { OptionSpec } from '../../src/args/types.js';

const specs: OptionSpec[] = [
  {
    name: 'working-folder', alias: 'w', type: 'string', description: 'folder',
  },
  { name: 'strict', type: 'boolean', description: 'strict' },
  {
    name: 'format', type: 'string', description: 'format', choices: ['text', 'json'],
  },
  {
    name: 'bundle', type: 'string', description: 'bundle', repeatable: true,
  },
];

describe('parseArgv', () => {
  it('separates positionals from options', () => {
    const parsed = parseArgv(['validate', './bundle.json', '--strict'], specs);
    expect(parsed.positionals).toEqual(['validate', './bundle.json']);
    expect(readBoolean(parsed.options, 'strict')).toBe(true);
  });

  it('accepts options before the command', () => {
    const parsed = parseArgv(['--working-folder', './api', 'validate'], specs);
    expect(parsed.positionals).toEqual(['validate']);
    expect(readString(parsed.options, 'working-folder')).toBe('./api');
  });

  it('supports short aliases and inline values', () => {
    const parsed = parseArgv(['-w', './api', '--format=json'], specs);
    expect(readString(parsed.options, 'working-folder')).toBe('./api');
    expect(readString(parsed.options, 'format')).toBe('json');
  });

  it('supports explicit negation of boolean options', () => {
    const parsed = parseArgv(['--no-strict'], specs);
    expect(parsed.options.strict).toBe(false);
  });

  it('collects repeatable options', () => {
    const parsed = parseArgv(['--bundle', 'a.json', '--bundle', 'b.json'], specs);
    expect(readList(parsed.options, 'bundle')).toEqual(['a.json', 'b.json']);
  });

  it('treats everything after -- as positional', () => {
    const parsed = parseArgv(['validate', '--', '--strict'], specs);
    expect(parsed.positionals).toEqual(['validate', '--strict']);
    expect(readBoolean(parsed.options, 'strict')).toBe(false);
  });

  it('rejects unknown options', () => {
    expect(() => parseArgv(['--nope'], specs)).toThrow('Unknown option: --nope');
    expect(() => parseArgv(['-x'], specs)).toThrow('Unknown option: -x');
  });

  it('rejects values outside the documented choices', () => {
    expect(() => parseArgv(['--format', 'yaml'], specs))
      .toThrow('Invalid value for --format: yaml');
  });

  it('rejects value options without a value', () => {
    expect(() => parseArgv(['--working-folder'], specs)).toThrow('requires a value');
    expect(() => parseArgv(['-w', '--strict'], specs)).toThrow('requires a value');
  });

  it('rejects values passed to boolean options', () => {
    expect(() => parseArgv(['--strict=true'], specs)).toThrow('does not accept a value');
  });

  it('reads missing options as undefined or false', () => {
    const parsed = parseArgv([], specs);
    expect(readString(parsed.options, 'format')).toBeUndefined();
    expect(readBoolean(parsed.options, 'strict')).toBe(false);
    expect(readList(parsed.options, 'bundle')).toEqual([]);
  });
});
